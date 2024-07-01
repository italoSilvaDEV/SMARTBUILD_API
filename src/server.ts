import express from 'express';
import { router } from './routes/routes';
import path from 'path';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();

// Configurar CORS
const corsOptions = {
  origin: '*', // Atualize conforme necessário para seu ambiente
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Servir arquivos estáticos
app.use('/public', express.static(path.join(__dirname, '../public')));
app.use(express.json());
app.use(router);

app.listen(4003, () => 
    console.log("server is running on http://localhost:4003")
);
