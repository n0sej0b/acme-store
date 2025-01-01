const pg = require('pg');
const { Pool } = require('pg');
const uuid = require('uuid');
const bcrypt = require('bcrypt');


const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://localhost/the_acme_store',
    max: 20,
    
});


pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

const createTables = async() => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const SQL = `
            DROP TABLE IF EXISTS favorites CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
            DROP TABLE IF EXISTS products CASCADE;
            
            CREATE TABLE users(
                id UUID PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE products(
                id UUID PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE favorites(
                id UUID PRIMARY KEY,
                product_id UUID REFERENCES products(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (user_id, product_id)
            );

            CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
            CREATE INDEX IF NOT EXISTS idx_favorites_product_id ON favorites(product_id);
        `;
        await client.query(SQL);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Error creating tables: ${error.message}`);
    } finally {
        client.release();
    }
};

const createUser = async({ username, password }) => {
    if (!username || !password) {
        throw new Error('Username and password are required');
    }
    
    try {
        const SQL = `
            INSERT INTO users(id, username, password) 
            VALUES($1, $2, $3) 
            RETURNING id, username, created_at
        `;
        const hashedPassword = await bcrypt.hash(password, 10); 
        const response = await pool.query(SQL, [uuid.v4(), username, hashedPassword]);
        return response.rows[0];
    } catch (error) {
        if (error.constraint === 'users_username_key') {
            throw new Error('Username already exists');
        }
        throw new Error(`Error creating user: ${error.message}`);
    }
};

const createProduct = async({ name }) => {
    if (!name) {
        throw new Error('Product name is required');
    }
    
    try {
        const SQL = `
            INSERT INTO products(id, name) 
            VALUES($1, $2) 
            RETURNING *
        `;
        const response = await pool.query(SQL, [uuid.v4(), name]);
        return response.rows[0];
    } catch (error) {
        if (error.constraint === 'products_name_key') {
            throw new Error('Product name already exists');
        }
        throw new Error(`Error creating product: ${error.message}`);
    }
};

const fetchUsers = async() => {
    try {
        const SQL = `
            SELECT id, username, created_at 
            FROM users 
            ORDER BY created_at DESC
        `;
        const response = await pool.query(SQL);
        return response.rows;
    } catch (error) {
        throw new Error(`Error fetching users: ${error.message}`);
    }
};

const fetchProducts = async() => {
    try {
        const SQL = `
            SELECT * 
            FROM products 
            ORDER BY created_at DESC
        `;
        const response = await pool.query(SQL);
        return response.rows;
    } catch (error) {
        throw new Error(`Error fetching products: ${error.message}`);
    }
};

const createFavorite = async({ user_id, product_id }) => {
    if (!user_id || !product_id) {
        throw new Error('User ID and Product ID are required');
    }

    try {
        const SQL = `
            INSERT INTO favorites(id, user_id, product_id)
            VALUES($1, $2, $3) 
            RETURNING id, user_id, product_id, created_at
        `;
        const response = await pool.query(SQL, [uuid.v4(), user_id, product_id]);
        return response.rows[0];
    } catch (error) {
        if (error.constraint === 'favorites_user_id_product_id_key') {
            throw new Error('Favorite already exists');
        }
        throw new Error(`Error creating favorite: ${error.message}`);
    }
};

const fetchFavorites = async({ user_id }) => {
    if (!user_id) {
        throw new Error('User ID is required');
    }

    try {
        const SQL = `
            SELECT f.id, f.user_id, f.product_id, p.name as product_name, f.created_at
            FROM favorites f
            JOIN products p ON f.product_id = p.id
            WHERE f.user_id = $1
            ORDER BY f.created_at DESC
        `;
        const response = await pool.query(SQL, [user_id]);
        return response.rows;
    } catch (error) {
        throw new Error(`Error fetching favorites: ${error.message}`);
    }
};

const destroyFavorite = async({ id, user_id }) => {
    if (!id || !user_id) {
        throw new Error('Favorite ID and User ID are required');
    }

    try {
        const SQL = `
            DELETE FROM favorites 
            WHERE id = $1 AND user_id = $2 
            RETURNING id
        `;
        const response = await pool.query(SQL, [id, user_id]);
        
        if (response.rowCount === 0) {
            throw new Error('Favorite not found or unauthorized');
        }
        
        return response.rows[0];
    } catch (error) {
        throw new Error(`Error deleting favorite: ${error.message}`);
    }
};

// Cleanup function for graceful shutdown
const cleanup = async() => {
    try {
        await pool.end();
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
};

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

module.exports = {
    pool,
    createTables,
    createUser,
    createProduct,
    fetchUsers,
    fetchProducts,
    createFavorite,
    fetchFavorites,
    destroyFavorite,
    cleanup
};
