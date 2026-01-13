#!/bin/bash

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to start..."
while ! pg_isready -h postgres -p 5432 -U travel_user; do
  sleep 1
done

echo "PostgreSQL is ready!"

# Run the schema
echo "Setting up database schema..."
psql -h postgres -U travel_user -d travel_db -f schema.sql

echo "Database setup complete!"
