-- ============================================================================
-- Travel API Database Schema
-- PostgreSQL 12+
-- ============================================================================

-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS attraction_inclusions CASCADE;
DROP TABLE IF EXISTS attraction_images CASCADE;
DROP TABLE IF EXISTS attractions CASCADE;
DROP TABLE IF EXISTS flights CASCADE;
DROP TABLE IF EXISTS geo_locations CASCADE;

-- ============================================================================
-- Table: geo_locations
-- Stores geographic location information
-- ============================================================================
CREATE TABLE geo_locations (
    id SERIAL PRIMARY KEY,
    location_name VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    country_code VARCHAR(10),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    dest_id VARCHAR(100),
    timezone VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_location_dest UNIQUE(location_name, dest_id)
);

COMMENT ON TABLE geo_locations IS 'Stores geographic location information from searches';
COMMENT ON COLUMN geo_locations.dest_id IS 'Booking.com destination ID';

-- ============================================================================
-- Table: flights
-- Stores flight information
-- ============================================================================
CREATE TABLE flights (
    id SERIAL PRIMARY KEY,
    flight_token VARCHAR(255) UNIQUE,
    flight_name VARCHAR(255),
    flight_number VARCHAR(50),
    airline_name VARCHAR(255),
    airline_logo TEXT,
    departure_airport VARCHAR(100),
    departure_airport_code VARCHAR(10),
    arrival_airport VARCHAR(100),
    arrival_airport_code VARCHAR(10),
    departure_time TIMESTAMP,
    arrival_time TIMESTAMP,
    duration VARCHAR(50),
    stops INTEGER DEFAULT 0,
    fare DECIMAL(10, 2),
    currency VARCHAR(10) DEFAULT 'AED',
    cabin_class VARCHAR(50),
    geo_location_id INTEGER REFERENCES geo_locations(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE flights IS 'Stores flight data from Booking.com API';
COMMENT ON COLUMN flights.flight_token IS 'Unique token from Booking.com API';
COMMENT ON COLUMN flights.stops IS 'Number of stops (0 = direct flight)';

-- ============================================================================
-- Table: attractions
-- Stores attraction information
-- ============================================================================
CREATE TABLE attractions (
    id SERIAL PRIMARY KEY,
    attraction_slug VARCHAR(255) UNIQUE,
    attraction_name VARCHAR(500),
    short_description TEXT,
    long_description TEXT,
    cancellation_policy TEXT,
    price DECIMAL(10, 2),
    currency VARCHAR(10) DEFAULT 'AED',
    rating DECIMAL(3, 2),
    review_count INTEGER,
    city VARCHAR(255),
    country VARCHAR(255),
    geo_location_id INTEGER REFERENCES geo_locations(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE attractions IS 'Stores attraction data from Booking.com API';
COMMENT ON COLUMN attractions.attraction_slug IS 'Unique slug identifier from Booking.com';
COMMENT ON COLUMN attractions.rating IS 'Rating out of 5.0';

-- ============================================================================
-- Table: attraction_images
-- Stores multiple images for each attraction
-- ============================================================================
CREATE TABLE attraction_images (
    id SERIAL PRIMARY KEY,
    attraction_id INTEGER REFERENCES attractions(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    caption TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE attraction_images IS 'Stores multiple images per attraction';
COMMENT ON COLUMN attraction_images.display_order IS 'Order in which images should be displayed';

-- ============================================================================
-- Table: attraction_inclusions
-- Stores what's included with each attraction
-- ============================================================================
CREATE TABLE attraction_inclusions (
    id SERIAL PRIMARY KEY,
    attraction_id INTEGER REFERENCES attractions(id) ON DELETE CASCADE,
    inclusion_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE attraction_inclusions IS 'Stores what is included with each attraction (amenities, services, etc.)';

-- ============================================================================
-- Indexes for Performance Optimization
-- ============================================================================

-- Indexes for flights table
CREATE INDEX idx_flights_departure ON flights(departure_airport_code);
CREATE INDEX idx_flights_arrival ON flights(arrival_airport_code);
CREATE INDEX idx_flights_geo_location ON flights(geo_location_id);
CREATE INDEX idx_flights_token ON flights(flight_token);
CREATE INDEX idx_flights_departure_time ON flights(departure_time);
CREATE INDEX idx_flights_fare ON flights(fare);

-- Indexes for attractions table
CREATE INDEX idx_attractions_geo_location ON attractions(geo_location_id);
CREATE INDEX idx_attractions_slug ON attractions(attraction_slug);
CREATE INDEX idx_attractions_city ON attractions(city);
CREATE INDEX idx_attractions_rating ON attractions(rating DESC);
CREATE INDEX idx_attractions_price ON attractions(price);

-- Indexes for geo_locations table
CREATE INDEX idx_geo_locations_name ON geo_locations(location_name);
CREATE INDEX idx_geo_locations_dest_id ON geo_locations(dest_id);
CREATE INDEX idx_geo_locations_country ON geo_locations(country);

-- Indexes for attraction images
CREATE INDEX idx_attraction_images_attraction_id ON attraction_images(attraction_id);
CREATE INDEX idx_attraction_images_display_order ON attraction_images(display_order);

-- Indexes for attraction inclusions
CREATE INDEX idx_attraction_inclusions_attraction_id ON attraction_inclusions(attraction_id);

-- ============================================================================
-- Views for Easy Querying
-- ============================================================================

-- View: Full flight information with location details
CREATE OR REPLACE VIEW v_flights_with_location AS
SELECT 
    f.id,
    f.flight_token,
    f.flight_name,
    f.flight_number,
    f.airline_name,
    f.airline_logo,
    f.departure_airport,
    f.departure_airport_code,
    f.arrival_airport,
    f.arrival_airport_code,
    f.departure_time,
    f.arrival_time,
    f.duration,
    f.stops,
    f.fare,
    f.currency,
    f.cabin_class,
    g.location_name,
    g.country,
    g.country_code,
    g.latitude,
    g.longitude,
    g.timezone,
    f.created_at,
    f.updated_at
FROM flights f
JOIN geo_locations g ON f.geo_location_id = g.id;

COMMENT ON VIEW v_flights_with_location IS 'Combines flight data with geographic location information';

-- View: Full attraction information with images and inclusions
CREATE OR REPLACE VIEW v_attractions_full AS
SELECT 
    a.id,
    a.attraction_slug,
    a.attraction_name,
    a.short_description,
    a.long_description,
    a.cancellation_policy,
    a.price,
    a.currency,
    a.rating,
    a.review_count,
    a.city,
    a.country,
    g.location_name,
    g.country_code,
    g.latitude,
    g.longitude,
    json_agg(DISTINCT jsonb_build_object(
        'url', ai.image_url, 
        'caption', ai.caption,
        'order', ai.display_order
    )) FILTER (WHERE ai.id IS NOT NULL) as images,
    json_agg(DISTINCT ainc.inclusion_text) FILTER (WHERE ainc.id IS NOT NULL) as inclusions,
    a.created_at,
    a.updated_at
FROM attractions a
JOIN geo_locations g ON a.geo_location_id = g.id
LEFT JOIN attraction_images ai ON a.id = ai.attraction_id
LEFT JOIN attraction_inclusions ainc ON a.id = ainc.attraction_id
GROUP BY 
    a.id, 
    a.attraction_slug,
    a.attraction_name,
    a.short_description,
    a.long_description,
    a.cancellation_policy,
    a.price,
    a.currency,
    a.rating,
    a.review_count,
    a.city,
    a.country,
    g.location_name, 
    g.country_code, 
    g.latitude, 
    g.longitude,
    a.created_at,
    a.updated_at;

COMMENT ON VIEW v_attractions_full IS 'Combines attraction data with location, images, and inclusions';

-- View: Summary statistics
CREATE OR REPLACE VIEW v_database_stats AS
SELECT 
    (SELECT COUNT(*) FROM geo_locations) as total_locations,
    (SELECT COUNT(*) FROM flights) as total_flights,
    (SELECT COUNT(*) FROM attractions) as total_attractions,
    (SELECT COUNT(*) FROM attraction_images) as total_images,
    (SELECT COUNT(*) FROM attraction_inclusions) as total_inclusions,
    (SELECT COUNT(DISTINCT country) FROM geo_locations) as unique_countries,
    (SELECT AVG(rating) FROM attractions WHERE rating IS NOT NULL) as avg_attraction_rating,
    (SELECT AVG(fare) FROM flights WHERE fare IS NOT NULL) as avg_flight_fare;

COMMENT ON VIEW v_database_stats IS 'Provides summary statistics of the database';

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column() IS 'Automatically updates the updated_at column on row updates';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_geo_locations_updated_at
    BEFORE UPDATE ON geo_locations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_flights_updated_at
    BEFORE UPDATE ON flights
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attractions_updated_at
    BEFORE UPDATE ON attractions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to get attractions by city
CREATE OR REPLACE FUNCTION get_attractions_by_city(city_name VARCHAR)
RETURNS TABLE (
    id INTEGER,
    name VARCHAR(500),
    city VARCHAR(255),
    price DECIMAL(10, 2),
    rating DECIMAL(3, 2),
    review_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id,
        a.attraction_name,
        a.city,
        a.price,
        a.rating,
        a.review_count
    FROM attractions a
    WHERE LOWER(a.city) = LOWER(city_name)
    ORDER BY a.rating DESC NULLS LAST, a.review_count DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_attractions_by_city(VARCHAR) IS 'Returns all attractions for a given city, sorted by rating';

-- Function to get flights by route
CREATE OR REPLACE FUNCTION get_flights_by_route(
    departure_code VARCHAR(10),
    arrival_code VARCHAR(10)
)
RETURNS TABLE (
    id INTEGER,
    flight_name VARCHAR(255),
    departure_time TIMESTAMP,
    arrival_time TIMESTAMP,
    duration VARCHAR(50),
    fare DECIMAL(10, 2),
    stops INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.id,
        f.flight_name,
        f.departure_time,
        f.arrival_time,
        f.duration,
        f.fare,
        f.stops
    FROM flights f
    WHERE f.departure_airport_code = departure_code
      AND f.arrival_airport_code = arrival_code
    ORDER BY f.fare ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_flights_by_route(VARCHAR, VARCHAR) IS 'Returns all flights for a specific route, sorted by fare';

-- ============================================================================
-- Grant Permissions
-- ============================================================================

-- Grant all privileges to travel_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO travel_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO travel_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO travel_user;

-- ============================================================================
-- Sample Data (Optional - Commented Out)
-- ============================================================================

/*
-- Insert sample geo location
INSERT INTO geo_locations (location_name, country, country_code, latitude, longitude, dest_id, timezone)
VALUES ('Dubai', 'United Arab Emirates', 'ae', 25.2048, 55.2708, 'dest_dubai_123', 'Asia/Dubai');

-- Insert sample flight
INSERT INTO flights (
    flight_token, flight_name, flight_number, airline_name,
    departure_airport, departure_airport_code, arrival_airport, arrival_airport_code,
    departure_time, arrival_time, duration, stops, fare, currency, cabin_class, geo_location_id
)
VALUES (
    'sample_token_123', 'Emirates 201', '201', 'Emirates',
    'John F. Kennedy International', 'JFK', 'Dubai International', 'DXB',
    '2025-01-15 10:00:00', '2025-01-16 08:00:00', '13h 00m', 0, 1299.99, 'AED', 'ECONOMY', 1
);

-- Insert sample attraction
INSERT INTO attractions (
    attraction_slug, attraction_name, short_description, price, currency, 
    rating, review_count, city, country, geo_location_id
)
VALUES (
    'burj-khalifa', 'Burj Khalifa', 'World\'s tallest building', 149.00, 'AED',
    4.8, 15234, 'Dubai', 'United Arab Emirates', 1
);
*/

-- ============================================================================
-- Useful Queries (Commented - For Reference)
-- ============================================================================

/*
-- Get all flights for a location
SELECT * FROM v_flights_with_location WHERE location_name = 'Dubai';

-- Get all attractions with full details
SELECT * FROM v_attractions_full WHERE city = 'Dubai';

-- Get database statistics
SELECT * FROM v_database_stats;

-- Get top-rated attractions
SELECT attraction_name, city, rating, review_count, price 
FROM attractions 
WHERE rating IS NOT NULL 
ORDER BY rating DESC, review_count DESC 
LIMIT 10;

-- Search flights by route
SELECT * FROM get_flights_by_route('JFK', 'DXB');

-- Get attractions by city
SELECT * FROM get_attractions_by_city('Dubai');

-- Find cheapest flights
SELECT flight_name, departure_airport_code, arrival_airport_code, fare, duration
FROM flights
WHERE fare IS NOT NULL
ORDER BY fare ASC
LIMIT 10;

-- Count attractions by country
SELECT country, COUNT(*) as attraction_count, AVG(rating) as avg_rating
FROM attractions
GROUP BY country
ORDER BY attraction_count DESC;

-- Recent searches
SELECT location_name, country, created_at
FROM geo_locations
ORDER BY created_at DESC
LIMIT 10;
*/

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ Database schema created successfully!';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Tables created:';
    RAISE NOTICE '   • geo_locations';
    RAISE NOTICE '   • flights';
    RAISE NOTICE '   • attractions';
    RAISE NOTICE '   • attraction_images';
    RAISE NOTICE '   • attraction_inclusions';
    RAISE NOTICE '';
    RAISE NOTICE '🔍 Indexes created: 16 indexes for optimal query performance';
    RAISE NOTICE '';
    RAISE NOTICE '👁️  Views created:';
    RAISE NOTICE '   • v_flights_with_location';
    RAISE NOTICE '   • v_attractions_full';
    RAISE NOTICE '   • v_database_stats';
    RAISE NOTICE '';
    RAISE NOTICE '⚡ Triggers created: Auto-update timestamps';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 Functions created:';
    RAISE NOTICE '   • get_attractions_by_city()';
    RAISE NOTICE '   • get_flights_by_route()';
    RAISE NOTICE '';
    RAISE NOTICE '🎉 Ready to use! Start your API server with: npm start';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
END $$;