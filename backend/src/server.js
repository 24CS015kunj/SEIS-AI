import "dotenv/config";
import connectDB from "./config/db.js";
import app from "./app.js";

connectDB()
    .then(() => {
        app.listen(process.env.PORT, () => {
            console.log(`Server is running on port ${process.env.PORT}`);
        });
    })
    .catch((err) => {
        console.log("Error while connecting to MongoDB", err);
    });