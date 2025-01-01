const express = require('express');
const morgan = require('morgan');
const { 
    client, 
    createTables, 
    createProduct, 
    createUser,
    fetchUsers,
    fetchProducts,
    createFavorite,
    fetchFavorites,
    destroyFavorite
} = require('./db');

const app = express();


app.use(express.json());
app.use(morgan('dev'));


const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Internal Server Error',
            status: err.status || 500
        }
    });
};


const validateId = (req, res, next) => {
    const id = req.params.id;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Invalid ID parameter' });
    }
    next();
};


app.get('/api/users', async (req, res, next) => {
    try {
        const users = await fetchUsers();
        res.json(users);
    } catch (error) {
        next(error);
    }
});

app.get('/api/products', async (req, res, next) => {
    try {
        const products = await fetchProducts();
        res.json(products);
    } catch (error) {
        next(error);
    }
});

app.get('/api/users/:id/favorites', validateId, async (req, res, next) => {
    try {
        const favorites = await fetchFavorites({ user_id: req.params.id });
        if (!favorites.length) {
            return res.status(404).json({ message: 'No favorites found for this user' });
        }
        res.json(favorites);
    } catch (error) {
        next(error);
    }
});

app.post('/api/users/:id/favorites', validateId, async (req, res, next) => {
    try {
        if (!req.body.product_id) {
            return res.status(400).json({ error: 'Product ID is required' });
        }

        const favorite = await createFavorite({ 
            product_id: req.body.product_id, 
            user_id: req.params.id 
        });
        
        res.status(201).json(favorite);
    } catch (error) {
        if (error.message.includes('already exists')) {
            return res.status(409).json({ error: 'Favorite already exists' });
        }
        next(error);
    }
});

app.delete('/api/users/:id/favorites/:favorite_id', validateId, async (req, res, next) => {
    try {
        await destroyFavorite({ 
            user_id: req.params.id, 
            id: req.params.favorite_id 
        });
        res.sendStatus(204);
    } catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: 'Favorite not found' });
        }
        next(error);
    }
});

// Initialize database and start server
const init = async () => {
    try {
        
        await client.connect();
        console.log('Connected to database');

        
        await createTables();
        console.log('Tables created successfully');

       
        const [cleats, bats, gloves, helmets, dave, bill, jessica] = await Promise.all([
            createProduct({ name: 'cleats' }),
            createProduct({ name: 'bats' }),
            createProduct({ name: 'gloves' }),
            createProduct({ name: 'helmets' }),
            createUser({ username: 'dave', password: 'Mr3000' }),
            createUser({ username: 'bill', password: 'deepballs' }),
            createUser({ username: 'jessica', password: 'bigpimpin' })
        ]);

        
        await Promise.all([
            createFavorite({ user_id: dave.id, product_id: gloves.id }),
            createFavorite({ user_id: bill.id, product_id: bats.id }),
            createFavorite({ user_id: jessica.id, product_id: gloves.id })
        ]);

        
        console.log('Users:', await fetchUsers());
        console.log('Products:', await fetchProducts());
        console.log('Dave\'s favorites:', await fetchFavorites({ user_id: dave.id }));

        // Start server
        const port = process.env.PORT || 3000;
        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to initialize application:', error);
        process.exit(1);
    }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    try {
        await client.end();
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});


app.use(errorHandler);


init();

module.exports = app; 
