const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const corsConfiguration = require("./utils/corsConfiguration")

const dotenv = require("dotenv").config();
const cookieParser = require("cookie-parser");
const bodyparser = require("body-parser");
// const amqplib = require('amqplib');
const hotelsRouter = require("./routes/hotels");
const app = express();
const PORT = process.env.PORT || 8080;

const connect = async () => {
  try {
    // await mongoose.connect("mongodb://localhost:28020/hotels_01");
    // await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:28020/hotels_01");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("connected to MongoDB");
  } catch (err) {
    // console.log(err.msg);
    console.log("err.msg");
  }
};

app.use(
  // cors(corsConfiguration)
  cors({
    origin: "https://meridian-hosts.com",
    credentials: true,
    // origin: "*"
  })
);

app.use(cookieParser());

app.use(express.json())

app.use("/api/v1/hotels", hotelsRouter);

app.get("/", (req, res) => {
  res.send("message was received in Hotels app");
});






app.use((err, req, res, next) => {
  // console.error('ERROR ', err)
  let error;
  if (err.name === "CastError") {
    error = { ...err };
    error.message = `Invalid ${err.path}: ${err.value}`;
    error.statusCode = 400;
    error.status = "fail";
    return res.status(error.statusCode).json({
      status: error.status,
      message: error.message,
    });
  }

  if (err.name === "JsonWebTokenError") {
    error = { ...err };
    error.message = "Your access token has been tampered with";
    error.statusCode = 401;
    error.status = "fail";
    return res.status(error.statusCode).json({
      status: error.status,
      message: error.message,
    });
  }

  if (err.name === "TokenExpiredError") {
    error = { ...err };
    error.message = "Your access token has expired";
    error.statusCode = 401;
    error.status = "fail";
    return res.status(error.statusCode).json({
      status: error.status,
      message: error.message,
    });
  }

  if (err.name === "ValidationError") {
    error = { ...err };
    // get all the errors from the error object
    const validationErrorsArray = Object.values(error.errors);

    // map through the validationErrorsArray to retrieve all the error messages
    const errorMessages = validationErrorsArray.map((vError) => vError.message);

    // join all the messages together
    const combinedMessage = errorMessages.join(". ");
    error.message = combinedMessage;
    error.statusCode = 400;
    error.status = "fail";
    return res.status(error.statusCode).json({
      status: error.status,
      message: error.message,
    });
  }

  if (err.code === 11000) {
    error = { ...err };
    error.message = `You tried to use a duplicate value, ${JSON.stringify(
      err.keyValue
    )}. Please provide a different value`;
    error.statusCode = 400;
    error.status = "fail";
    // console.log(error);
    return res.status(error.statusCode).json({
      status: error.status,
      message: error.message,
    });
  }

  const errorStatus = err.status || "error";
  const errorStatusCode = err.statusCode || 500;
  const errorMessage = err.message || "Something went wrong !!";

  res.status(errorStatusCode).json({
    status: errorStatus,
    message: errorMessage,
    error: err,
  });
});





const server = app.listen(PORT, () => {
  connect();
  console.log("listening on port 8080");
});


