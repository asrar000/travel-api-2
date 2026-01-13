// ============================================================================
// Travel API Backend - Complete Implementation (Fixed)
// ============================================================================

const { Pool } = require('pg');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

// -----------------------------
// DATABASE CONNECTION
// -----------------------------
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
    process.exit(-1);
});

// -----------------------------
// API SERVICE (Booking.com)
// -----------------------------
const API_KEY = process.env.BOOKING_API_KEY || '77a4559276mshe93d7a55a4fd12fp1b5f99jsn37d157158b02';
const API_HOST = process.env.BOOKING_API_HOST || 'booking-com15.p.rapidapi.com';

const apiClient = axios.create({
    baseURL: 'https://booking-com15.p.rapidapi.com/api/v1',
    headers: {
        'x-rapidapi-host': API_HOST,
        'x-rapidapi-key': API_KEY
    }
});

// API Functions
const bookingAPI = {
    searchFlightDestination: async (query) => {
        const response = await apiClient.get('/flights/searchDestination', {
            params: { query }
        });
        return response.data;
    },

    searchFlights: async (fromId, toId, params = {}) => {
        const response = await apiClient.get('/flights/searchFlights', {
            params: {
                fromId,
                toId,
                stops: params.stops || 'none',
                pageNo: 1,
                adults: params.adults || 1,
                children: params.children || 0,
                sort: 'BEST',
                cabinClass: params.cabinClass || 'ECONOMY',
                currency_code: 'AED'
            }
        });
        return response.data;
    },

    searchAttractionLocation: async (query) => {
        const response = await apiClient.get('/attraction/searchLocation', {
            params: {
                query,
                languagecode: 'en-us'
            }
        });
        return response.data;
    },

    searchAttractions: async (destId) => {
        const response = await apiClient.get('/attraction/searchAttractions', {
            params: {
                id: destId,
                page: 1,
                currency_code: 'AED',
                languagecode: 'en-us'
            }
        });
        return response.data;
    }
};

// -----------------------------
// DATABASE OPERATIONS
// -----------------------------
const db = {
    saveGeoLocation: async (locationData) => {
        const query = `
            INSERT INTO geo_locations (location_name, country, country_code, latitude, longitude, dest_id, timezone)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (location_name, dest_id) 
            DO UPDATE SET 
                country = EXCLUDED.country,
                country_code = EXCLUDED.country_code,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `;
        const values = [
            locationData.name,
            locationData.country,
            locationData.country_code,
            locationData.latitude,
            locationData.longitude,
            locationData.dest_id,
            locationData.timezone
        ];
        const result = await pool.query(query, values);
        return result.rows[0].id;
    },

    saveFlight: async (flightData, geoLocationId) => {
        const query = `
            INSERT INTO flights (
                flight_token, flight_name, flight_number, airline_name, airline_logo,
                departure_airport, departure_airport_code, arrival_airport, arrival_airport_code,
                departure_time, arrival_time, duration, stops, fare, currency, cabin_class, geo_location_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (flight_token) 
            DO UPDATE SET 
                fare = EXCLUDED.fare,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `;
        const values = [
            flightData.token,
            flightData.name,
            flightData.number,
            flightData.airline_name,
            flightData.logo,
            flightData.departure_airport,
            flightData.departure_code,
            flightData.arrival_airport,
            flightData.arrival_code,
            flightData.departure_time,
            flightData.arrival_time,
            flightData.duration,
            flightData.stops,
            flightData.fare,
            flightData.currency,
            flightData.cabin_class,
            geoLocationId
        ];
        const result = await pool.query(query, values);
        return result.rows[0].id;
    },

    saveAttraction: async (attractionData, geoLocationId) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const attractionQuery = `
                INSERT INTO attractions (
                    attraction_slug, attraction_name, short_description, long_description,
                    cancellation_policy, price, currency, rating, review_count,
                    city, country, geo_location_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (attraction_slug)
                DO UPDATE SET
                    attraction_name = EXCLUDED.attraction_name,
                    price = EXCLUDED.price,
                    rating = EXCLUDED.rating,
                    review_count = EXCLUDED.review_count,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id
            `;
            const attractionValues = [
                attractionData.slug,
                attractionData.name,
                attractionData.short_description,
                attractionData.long_description,
                attractionData.cancellation_policy,
                attractionData.price,
                attractionData.currency,
                attractionData.rating,
                attractionData.review_count,
                attractionData.city,
                attractionData.country,
                geoLocationId
            ];
            const attractionResult = await client.query(attractionQuery, attractionValues);
            const attractionId = attractionResult.rows[0].id;

            await client.query('DELETE FROM attraction_images WHERE attraction_id = $1', [attractionId]);
            await client.query('DELETE FROM attraction_inclusions WHERE attraction_id = $1', [attractionId]);

            if (attractionData.images && attractionData.images.length > 0) {
                for (let i = 0; i < attractionData.images.length; i++) {
                    await client.query(
                        'INSERT INTO attraction_images (attraction_id, image_url, display_order) VALUES ($1, $2, $3)',
                        [attractionId, attractionData.images[i], i]
                    );
                }
            }

            if (attractionData.inclusions && attractionData.inclusions.length > 0) {
                for (const inclusion of attractionData.inclusions) {
                    await client.query(
                        'INSERT INTO attraction_inclusions (attraction_id, inclusion_text) VALUES ($1, $2)',
                        [attractionId, inclusion]
                    );
                }
            }

            await client.query('COMMIT');
            return attractionId;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    getFlightById: async (id) => {
        const query = `
            SELECT f.*, g.location_name, g.country, g.country_code, g.latitude, g.longitude
            FROM flights f
            JOIN geo_locations g ON f.geo_location_id = g.id
            WHERE f.id = $1
        `;
        const result = await pool.query(query, [id]);
        return result.rows[0];
    },

    getAttractionById: async (id) => {
        const query = `
            SELECT a.*, g.location_name, g.country, g.country_code, g.latitude, g.longitude,
                   json_agg(DISTINCT jsonb_build_object('url', ai.image_url, 'order', ai.display_order)) 
                       FILTER (WHERE ai.id IS NOT NULL) as images,
                   json_agg(DISTINCT ainc.inclusion_text) 
                       FILTER (WHERE ainc.id IS NOT NULL) as inclusions
            FROM attractions a
            JOIN geo_locations g ON a.geo_location_id = g.id
            LEFT JOIN attraction_images ai ON a.id = ai.attraction_id
            LEFT JOIN attraction_inclusions ainc ON a.id = ainc.attraction_id
            WHERE a.id = $1
            GROUP BY a.id, g.location_name, g.country, g.country_code, g.latitude, g.longitude
        `;
        const result = await pool.query(query, [id]);
        return result.rows[0];
    }
};

// -----------------------------
// EXPRESS API SERVER
// -----------------------------
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// -----------------------------
// ENDPOINT 1: /search/:locationname
// -----------------------------
app.get('/search/:locationname', async (req, res) => {
    const { locationname } = req.params;

    try {
        console.log(`🔍 Searching for location: ${locationname}`);

        const locationSearchResults = await bookingAPI.searchAttractionLocation(locationname);
        
        console.log('📦 API Response:', JSON.stringify(locationSearchResults, null, 2));

        // Handle different response structures
        let locationData = null;
        
        if (locationSearchResults.data && Array.isArray(locationSearchResults.data) && locationSearchResults.data.length > 0) {
            locationData = locationSearchResults.data;
        } else if (locationSearchResults.data && locationSearchResults.data.destinations) {
            locationData = locationSearchResults.data.destinations;
        } else if (Array.isArray(locationSearchResults) && locationSearchResults.length > 0) {
            locationData = locationSearchResults;
        }

        if (!locationData || locationData.length === 0) {
            return res.status(404).json({
                error: 'Location not found',
                message: `No results found for "${locationname}"`,
                debug: locationSearchResults
            });
        }

        const locationInfo = locationData[0];
        console.log('📍 Location Info:', locationInfo);

        // Extract location details with fallbacks
        const geoData = {
            name: locationInfo.city_name || locationInfo.name || locationInfo.label || locationname,
            country: locationInfo.country || locationInfo.country_name || 'Unknown',
            country_code: locationInfo.cc1 || locationInfo.country_code || locationInfo.cc || '',
            latitude: locationInfo.latitude || locationInfo.lat || null,
            longitude: locationInfo.longitude || locationInfo.lon || locationInfo.lng || null,
            dest_id: locationInfo.dest_id || locationInfo.id || `dest_${Date.now()}`,
            timezone: locationInfo.timezone || locationInfo.tz || null
        };

        console.log('💾 Saving geo location:', geoData);
        const geoLocationId = await db.saveGeoLocation(geoData);

        let flights = [];
        try {
            const flightDestSearch = await bookingAPI.searchFlightDestination(locationname);
            console.log('✈️ Flight destination search:', flightDestSearch);
            
            if (flightDestSearch.data && flightDestSearch.data.length > 0) {
                const airportCode = flightDestSearch.data[0].code || flightDestSearch.data[0].id;
                const fromId = `${airportCode}.AIRPORT`;
                
                console.log(`🛫 Searching flights to: ${fromId}`);
                const departureCode = req.query.from ? `${req.query.from}.AIRPORT` : 'JFK.AIRPORT';
                const flightResults = await bookingAPI.searchFlights(departureCode, fromId);
                
                if (flightResults.data && flightResults.data.flightOffers) {
                    console.log(`✅ Found ${flightResults.data.flightOffers.length} flight offers`);
                    
                    for (const offer of flightResults.data.flightOffers.slice(0, 10)) {
                        const segments = offer.segments || [];
                        const firstSegment = segments[0] || {};
                        const lastSegment = segments[segments.length - 1] || {};
                        
                        const flightData = {
                            token: offer.token || `flight_${Date.now()}_${Math.random()}`,
                            name: `${firstSegment.legs?.[0]?.carriersData?.[0]?.name || 'Unknown'} ${firstSegment.legs?.[0]?.flightInfo?.flightNumber || ''}`,
                            number: firstSegment.legs?.[0]?.flightInfo?.flightNumber || '',
                            airline_name: firstSegment.legs?.[0]?.carriersData?.[0]?.name || 'Unknown',
                            logo: firstSegment.legs?.[0]?.carriersData?.[0]?.logo || '',
                            departure_airport: firstSegment.departureAirport?.name || 'Unknown',
                            departure_code: firstSegment.departureAirport?.code || 'JFK',
                            arrival_airport: lastSegment.arrivalAirport?.name || 'Unknown',
                            arrival_code: lastSegment.arrivalAirport?.code || airportCode,
                            departure_time: firstSegment.departureTime || null,
                            arrival_time: lastSegment.arrivalTime || null,
                            duration: offer.totalDuration || '',
                            stops: segments.length - 1,
                            fare: offer.priceBreakdown?.total?.units || 0,
                            currency: 'AED',
                            cabin_class: 'ECONOMY'
                        };

                        await db.saveFlight(flightData, geoLocationId);
                        flights.push(flightData);
                    }
                }
            }
        } catch (flightError) {
            console.warn('⚠️ Flight search error:', flightError.message);
        }

        const attractions = [];
        try {
            const destId = locationInfo.dest_id || locationInfo.id;
            console.log(`🎡 Searching attractions for dest_id: ${destId}`);
            
            const attractionResults = await bookingAPI.searchAttractions(destId);
            console.log('🎯 Attraction results:', attractionResults.data ? 'Found' : 'Not found');
            
            if (attractionResults.data && attractionResults.data.products) {
                console.log(`✅ Found ${attractionResults.data.products.length} attractions`);
                
                for (const product of attractionResults.data.products.slice(0, 20)) {
                    const attractionData = {
                        slug: product.slug || product.id || `attraction_${Date.now()}_${Math.random()}`,
                        name: product.name || 'Unknown Attraction',
                        short_description: product.shortDescription || product.short_description || '',
                        long_description: product.description || product.long_description || '',
                        cancellation_policy: product.cancellationPolicy?.description || product.cancellation_policy || '',
                        price: product.pricing?.price?.value || product.price || 0,
                        currency: 'AED',
                        rating: product.reviewsStats?.avg || product.rating || 0,
                        review_count: product.reviewsStats?.total || product.reviewCount || product.review_count || 0,
                        city: geoData.name,
                        country: geoData.country,
                        images: product.images?.map(img => img.url || img) || [],
                        inclusions: product.inclusions || []
                    };

                    await db.saveAttraction(attractionData, geoLocationId);
                    attractions.push(attractionData);
                }
            }
        } catch (attractionError) {
            console.warn('⚠️ Attraction search error:', attractionError.message);
            console.error('Full error:', attractionError);
        }

        const response = {
            GeoInfo: {
                location_name: geoData.name,
                country: geoData.country,
                country_code: geoData.country_code,
                dest_id: geoData.dest_id,
                latitude: geoData.latitude,
                longitude: geoData.longitude,
                timezone: geoData.timezone,
                label: locationInfo.label || geoData.name
            },
            Flights: flights,
            Attractions: attractions
        };

        console.log(`✅ Found ${flights.length} flights and ${attractions.length} attractions`);
        res.json(response);

    } catch (error) {
        console.error('❌ Error in /search endpoint:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// -----------------------------
// ENDPOINT 2: /details/:id
// -----------------------------
app.get('/details/:id', async (req, res) => {
    const { id } = req.params;
    const { searchtype } = req.query;

    try {
        if (!searchtype || !['flight', 'attraction'].includes(searchtype.toLowerCase())) {
            return res.status(400).json({
                error: 'Invalid search type',
                message: 'searchtype must be either "flight" or "attraction"'
            });
        }

        if (searchtype.toLowerCase() === 'flight') {
            const flight = await db.getFlightById(id);
            
            if (!flight) {
                return res.status(404).json({
                    error: 'Flight not found',
                    message: `No flight found with id ${id}`
                });
            }

            const response = {
                GeoInfo: {
                    location_name: flight.location_name,
                    country: flight.country,
                    country_code: flight.country_code,
                    latitude: flight.latitude,
                    longitude: flight.longitude
                },
                Flight: {
                    id: flight.id,
                    flight_token: flight.flight_token,
                    flight_name: flight.flight_name,
                    flight_number: flight.flight_number,
                    airline_name: flight.airline_name,
                    airline_logo: flight.airline_logo,
                    departure: {
                        airport: flight.departure_airport,
                        airport_code: flight.departure_airport_code,
                        time: flight.departure_time
                    },
                    arrival: {
                        airport: flight.arrival_airport,
                        airport_code: flight.arrival_airport_code,
                        time: flight.arrival_time
                    },
                    duration: flight.duration,
                    stops: flight.stops,
                    fare: {
                        amount: flight.fare,
                        currency: flight.currency
                    },
                    cabin_class: flight.cabin_class,
                    created_at: flight.created_at
                }
            };

            res.json(response);

        } else {
            const attraction = await db.getAttractionById(id);
            
            if (!attraction) {
                return res.status(404).json({
                    error: 'Attraction not found',
                    message: `No attraction found with id ${id}`
                });
            }

            const response = {
                GeoInfo: {
                    location_name: attraction.location_name,
                    country: attraction.country,
                    country_code: attraction.country_code,
                    latitude: attraction.latitude,
                    longitude: attraction.longitude
                },
                Attraction: {
                    id: attraction.id,
                    slug: attraction.attraction_slug,
                    name: attraction.attraction_name,
                    description: {
                        short: attraction.short_description,
                        long: attraction.long_description
                    },
                    location: {
                        city: attraction.city,
                        country: attraction.country
                    },
                    pricing: {
                        amount: attraction.price,
                        currency: attraction.currency
                    },
                    rating: {
                        score: attraction.rating,
                        review_count: attraction.review_count
                    },
                    cancellation_policy: attraction.cancellation_policy,
                    images: attraction.images || [],
                    inclusions: attraction.inclusions || [],
                    created_at: attraction.created_at
                }
            };

            res.json(response);
        }

    } catch (error) {
        console.error('❌ Error in /details endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        database: 'connected'
    });
});

// Get all locations
app.get('/locations', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM geo_locations ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: `Route ${req.method} ${req.path} not found`
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════════╗
    ║   🚀 Travel API Server Started             ║
    ║   📍 Port: ${PORT}                            ║
    ║   🗄️  Database: PostgreSQL                 ║
    ║   ✅ Status: Ready                          ║
    ╚════════════════════════════════════════════╝
    
    Available endpoints:
    - GET  /search/:locationname
    - GET  /details/:id?searchtype=flight|attraction
    - GET  /health
    - GET  /locations
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    pool.end(() => {
        console.log('Database pool has ended');
    });
});

module.exports = app;