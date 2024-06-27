import express from 'express';
import { router } from './routes/routes';
import path from 'path';
import dotenv from 'dotenv';


dotenv.config();

const app = express();

app.use('/public', express.static(path.join(__dirname, '../public')));
app.use(express.json())
app.use(router)


app.use(express.static('public'));

app.listen(4003, ()=> 
    console.log("server is running on http://localhost:4003")
)



