const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function testConnection() {
    try {
        const client = await pool.connect();
        console.log('✅ Connected to PostgreSQL database successfully!');
        console.log(`📊 Database: ${process.env.DB_NAME}`);
        console.log(`👤 User: ${process.env.DB_USER}`);
        
        // Test query
        const timeResult = await client.query('SELECT NOW()');
        console.log('⏰ Server time:', timeResult.rows[0].now);
        
        // Check tables
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        
        console.log('\n📋 Available tables:');
        tablesResult.rows.forEach(row => {
            console.log(`   ✓ ${row.table_name}`);
        });
        
        // Check if tables are empty
        const countsResult = await client.query(`
            SELECT 
                (SELECT COUNT(*) FROM geo_locations) as locations,
                (SELECT COUNT(*) FROM flights) as flights,
                (SELECT COUNT(*) FROM attractions) as attractions
        `);
        
        console.log('\n📊 Record counts:');
        console.log(`   Locations: ${countsResult.rows[0].locations}`);
        console.log(`   Flights: ${countsResult.rows[0].flights}`);
        console.log(`   Attractions: ${countsResult.rows[0].attractions}`);
        
        console.log('\n🎉 Database setup is complete and ready to use!');
        
        client.release();
        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Database connection error:', err.message);
        console.error('\nTroubleshooting:');
        console.error('1. Make sure PostgreSQL is running: sudo service postgresql status');
        console.error('2. Check your .env file has correct credentials');
        console.error('3. Verify user has access: psql -U travel_user -d travel_db -h localhost');
        process.exit(1);
    }
}

testConnection();