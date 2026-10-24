const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();

const rawFrontendUrl = process.env.FRONTEND_URL || '';
const configuredOrigins = rawFrontendUrl
  .split(',')
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = [
  ...configuredOrigins,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
];

// Security and utility middlewares
app.use(helmet({ contentSecurityPolicy: false })); // allow inline css for /api/docs
app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server, mobile or curl requests with no origin
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/+$/, '');
    if (allowedOrigins.includes(cleanOrigin) || cleanOrigin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked: Origin ${origin} is not allowed.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Root Redirect to Docs
app.get('/', (req, res) => {
  res.redirect('/api/docs');
});

// API Routes
app.use('/api', routes);

// Error Handling Middlewares
app.use(notFound);
app.use(errorHandler);

module.exports = app;
