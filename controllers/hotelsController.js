// const Booking = require("../models/bookings");
// const Review = require("../models/reviews");

const Hotel = require('../models/hotels')
const Room = require("../models/rooms");
const City = require("../models/cities");
const HotelType = require("../models/hotelTypes");
const amqplib = require('amqplib');
const createError = require("../utils/error");
const rabbitMQ_connection = require('../utils/producer')

const exchangeName = "topic_logs";
const exchangeType = 'topic';
const queue_name = "hotels_queue"
const routing_key = ['hotels.hotelsBookings.deleteMany', 'hotels.hotelsReviews.deleteMany', 'hotels.hotelName.updateMany']
let channel_hotels_producer;

const sendTask = async () => {
  const connection = await rabbitMQ_connection()
  channel_hotels_producer = await connection.createChannel();
  await channel_hotels_producer.assertExchange(exchangeName, exchangeType, {durable: false});
  console.log("Connected to rabbitMQ hotelServices")
}

sendTask();


let channel_hotels_consumer;
const binding_keys = ['auth.hotelStaff.deleteMany', 'auth.hotelStaff.updateMany', 'bookings.hotelsBookings.updateRooms', 'reviews.hotelsReviews.updateMany', 'bookings.usersBookings.deleteMany']

const consumeTask = async () => {
  // const connection = await amqplib.connect('amqp://localhost');
  const connection = await rabbitMQ_connection();
  channel_hotels_consumer = await connection.createChannel();
  await channel_hotels_consumer.assertExchange(exchangeName, exchangeType, {durable: false});
  await channel_hotels_consumer.assertQueue(queue_name, {durable: false});

  channel_hotels_consumer.prefetch(1);
  // console.log("Waiting for messages in hotel_queue");

  binding_keys.forEach((key) => {
    channel_hotels_consumer.bindQueue(queue_name, exchangeName, key);
  });

  channel_hotels_consumer.consume(queue_name, async msg => {
    const product = JSON.parse(msg.content.toString());
    
    if (msg.fields.routingKey == 'auth.hotelStaff.deleteMany') {
      const hotel = await Hotel.find({
        $or: [{ "manager.ref_number": product.user }, { "staff.ref_number": product.user }],
      });
  
      if (hotel.length > 0) {
        hotel.forEach(async (eachHotel) => {
          if (eachHotel.manager.ref_number == product.user) {
            eachHotel.manager.name = undefined;
            eachHotel.manager.ref_number = undefined;
          }
          eachHotel.staff = eachHotel.staff.filter(
            (eachStaff) => eachStaff.ref_number != product.user
          );
          await eachHotel.save();
        });
      }

      // console.log(`routing key: ${msg.fields.routingKey}`);
      // console.log("Received product: ", JSON.stringify(product));
      // // console.log("Received product: ", JSON.stringify(msg));
    }
    
    if (msg.fields.routingKey == 'reviews.hotelsReviews.updateMany') {
      if (product.reviewStats.length > 0) {
        await Hotel.findByIdAndUpdate(product.hotel_id, {
            numberOfRatings: product.reviewStats[0].numberOfRatings,
            ratingsAverage: product.reviewStats[0].averageRating
        })
      } else {
        await Hotel.findByIdAndUpdate(product.hotel_id, {
            numberOfRatings: 0,
            ratingsAverage: 4.5
        })
      }

      // console.log(`routing key: ${msg.fields.routingKey}`);
      // console.log("Received product: ", JSON.stringify(product));
      // // console.log("Received product: ", JSON.stringify(msg));
    }

    if (msg.fields.routingKey == 'auth.hotelStaff.updateMany') {
      // console.log("Inside hotel staff update: Product", JSON.stringify(product))
      const hotel = await Hotel.find({
        $or: [{ "manager.ref_number": product.ref_number }, { "staff.ref_number": product.ref_number }],
      });
  
      if (hotel.length > 0) {
        // console.log("hotel: ", JSON.stringify(hotel))
        hotel.forEach(async (eachHotel) => {
          if (eachHotel.manager.ref_number == product.ref_number) {
            eachHotel.manager.name = product.name;
            
          }
          if ((eachHotel.staff).length > 0) {
            eachHotel.staff = eachHotel.staff.map(
              (eachStaff) => {
                // console.log("eachStaff: ", JSON.stringify(eachStaff))
                if (eachStaff.ref_number == product.ref_number) {
                  eachStaff.name = product.name
                  return eachStaff
                } else return eachStaff
              } 
            );
          }
          
          await eachHotel.save();
        });
      }

      // console.log(`routing key: ${msg.fields.routingKey}`);
      // // console.log("Received product: ", JSON.stringify(product));
      // // console.log("Received product: ", JSON.stringify(msg));
    }


    if (msg.fields.routingKey == 'bookings.usersBookings.deleteMany') {
      product.bookingDetails.forEach(async roomInfo => {
        // // console.log('roomInfo: ', roomInfo)
        

        const roomStyle = await Room.findOne({ "roomNumbers._id": roomInfo.room_id })
        // // console.log('roomStyle: ', roomStyle)
        const room = (roomStyle.roomNumbers)?.find(({ _id }) => _id == roomInfo.room_id)
        // // console.log('room: ', room)
        const convertedDates = room.unavailableDates?.map(eachDate => eachDate.getTime())
 
        const indexOfCheckinDate = convertedDates?.indexOf((new Date(roomInfo.checkin_date)).getTime())
        // console.log('indexOfCheckinDate: ', indexOfCheckinDate)

        if (indexOfCheckinDate >= 0) {
            room.unavailableDates.splice(indexOfCheckinDate, roomInfo.number_of_nights)
        }


        roomStyle.roomNumbers = roomStyle.roomNumbers?.map((roomNumber) => {
            if (roomNumber._id == roomInfo.room_id) {
                return {
                    ...roomNumber,
                    unavailableDates: [...room.unavailableDates]
                }
            } else return roomNumber
        })


        await Room.updateOne(
            { "roomNumbers._id": roomInfo.room_id },
            {
              $set: {
                "roomNumbers.$.unavailableDates": room.unavailableDates,
              },
            }
          );

      })

    }


    if (msg.fields.routingKey == 'bookings.hotelsBookings.updateRooms') {

      const updateRoomAvailability = async (room_id, reservedDates) => {
        // // console.log(req.body.reservedDates)
      
        const compareNumbers = (a, b) => {
          return new Date(a).getTime() - new Date(b).getTime();
        };
        try {
          // get the room style to update
          const roomStyle = await Room.findOne({ "roomNumbers._id": room_id });
          // // console.log(roomStyle)
          // get the room to update
          // // console.log(roomStyle.roomNumbers[0]?._id)
          const room = roomStyle.roomNumbers.find(({ _id }) => _id == room_id);
          // // console.log(room)
      
          // update the unavailable dates for the room
          const unavailableDates = room.unavailableDates.concat(reservedDates);
          // // console.log(unavailableDates)
          if (unavailableDates.length >= 2) {
            unavailableDates.sort(compareNumbers);
          }
      

          roomStyle.roomNumbers = roomStyle.roomNumbers.map((roomNumber) => {
            if (roomNumber._id == room_id) {
              return {
                ...roomNumber,
                unavailableDates: [...unavailableDates],
              };
            } else return roomNumber;
          });
      
          // // console.log(roomStyle)
      
          await Room.updateOne(
            { "roomNumbers._id": room_id },
            {
              $set: {
                "roomNumbers.$.unavailableDates": unavailableDates,
              },
            }
          );

        } catch (err) {
          // console.log(err);
        }
      };


      product.selectedRooms.forEach(async (room_id) => {
        await updateRoomAvailability(room_id, product.reservedDates);
      });

    }

      // // console.log(`Received product: ${product.name}`);
      // console.log(`routing key outside: ${msg.fields.routingKey}`);
      channel_hotels_consumer.ack(msg)
  }, {noAck: false})
}

consumeTask();



// create hotel
const createHotel = async (req, res, next) => {
  try {
    const hotel = await Hotel.create(req.body);
    res.status(201).json({
      data: hotel,
    });
  } catch (err) {
    next(err);
  }
};

// get all hotels
const getAllHotels = async (req, res, next) => {
  let sort;
  let limit;
  if (req.query.sort) {
    sort = req.query.sort;
  }
  if (req.query.limit) {
    limit = req.query.limit;
  }

  let name = {};
  let type = {};
  let city = {};
  let queryParams = {};
  let expressionsArray = [];

  if (req.query.city) {
    try {
      const hotelCity = await City.findOne({
        cityName: req.query.city.toLowerCase(),
      });
      if (!hotelCity) {
        return next(
          createError(
            "fail",
            404,
            `Sorry, we have no property in ${req.query.city}`
          )
        );
      }
      city.city = hotelCity._id;
      expressionsArray.push(city);
    } catch (err) {
      next(err);
    }
  }


  if (req.query.cityref) {
    city.city = req.query.cityref
    expressionsArray.push({city: req.query.cityref});
    // console.log('city: ', city)
  }
  

  if (expressionsArray.length > 0) {
    queryParams = { $or: expressionsArray };
  }

  try {
    const hotels = await Hotel.find(queryParams).sort(sort).limit(limit);
    res.status(200).json({
      number: hotels.length,
      data: hotels,
    });
  } catch (err) {
    next(err);
  }
};

// List hotels within a price range
const getAllHotelsWithinPriceRange = async (req, res, next) => {
  const minPrice = req.query.min * 1 || 0;
  const maxPrice = req.query.max * 1 || 1000;

  let queryParams = {};

  queryParams.cheapestPrice = {
    $gte: minPrice,
    $lte: maxPrice,
  };

  if (req.query.city) {
    try {
      const hotelCity = await City.findOne({
        cityName: req.query.city.toLowerCase(),
      });
      if (!hotelCity) {
        return next(
          createError(
            "fail",
            404,
            `Sorry we have no property in ${req.query.city}`
          )
        );
      }
      queryParams.city = hotelCity._id;
    } catch (err) {
      next(err);
    }
  }

  try {
    const hotels = await Hotel.find(queryParams);
    res.status(200).json({
      number: hotels.length,
      data: hotels,
    });
  } catch (err) {
    next(err);
  }
};

// get a specific hotel
const getHotel = async (req, res, next) => {
  try {
    
    const hotel = await Hotel.findById(req.params.hotel_id)
    if (!hotel)
      return next(createError("fail", 404, "this hotel does not exist"));
    res.status(200).json({
      data: hotel,
    });
  } catch (err) {
    next(err);
  }
};

// update a specific hotel
const updateHotel = async (req, res, next) => {
  try {
    const hotel = await Hotel.findById(req.params.hotel_id);
    if (!hotel)
      return next(createError("fail", 404, "this hotel does not exist"));

    if (req.body.name) {
      hotel.name = req.body.name.trim();
    }
    if (req.body.city) hotel.city = req.body.city.trim();
    if (req.body.type) hotel.type = req.body.type.trim();
    if (req.body.address) hotel.hotelLocation.address = req.body.address.trim();
    if (req.body.description) hotel.description = req.body.description.trim();
    // expects an object 
    if (req.body.manager) {
      hotel.manager.ref_number = req.body.manager.ref_number.trim();
      hotel.manager.name = req.body.manager.name.trim();
    } 
    // expects an object 
    if (req.body.addStaff) {
      const staff = hotel.staff.find(({ref_number}) => {
        return ref_number == req.body.addStaff.ref_number
      })

      if (!staff) hotel.staff.push(req.body.addStaff)
    }

    // expects a string
    if (req.body.removeStaff) {
      hotel.staff = hotel.staff.filter(
        ({ref_number}) => ref_number != req.body.removeStaff.trim()
      );
    }

    const updatedHotel = await hotel.save();
    if (req.body.name) {
      channel_hotels_producer.publish(exchangeName, routing_key[2], Buffer.from(JSON.stringify({ ref_number: hotel._id, name: hotel.name })));
    }

    // const hotel2 = await Hotel.findByIdAndUpdate(req.params.hotel_id, { $set: req.body }, { new: true, runValidators: true })
    // if (!hotel) return next(createError('fail', 404, 'this hotel does not exist'))
    res.status(200).json({
      data: updatedHotel,
    });
  } catch (err) {
    next(err);
  }
};

// delete a specific hotel
const deleteHotel = async (req, res, next) => {
  try {
    const hotel = await Hotel.findByIdAndDelete(req.params.hotel_id);
    if (!hotel)
      return next("fail", createError(404, "this hotel does not exist"));

    // delete the rooms that belong to this hotel
    const rooms = await Room.deleteMany({ hotel: hotel._id });

    // delete the bookings for this hotel
    // const bookings = await Booking.deleteMany({ hotel: hotel._id });
    channel_hotels_producer.publish(exchangeName, routing_key[0], Buffer.from(JSON.stringify({ hotel: hotel._id })));
    // delete the reviews for this hotel
    // const reviews = await Review.deleteMany({ hotel: hotel._id });
    channel_hotels_producer.publish(exchangeName, routing_key[1], Buffer.from(JSON.stringify({ hotel: hotel._id })));
    // check if there is any hotel left in the city 
    const numberOfHotelsInCity = await Hotel.find({city: hotel.city})
    if (numberOfHotelsInCity.length == 0) {
      await City.findByIdAndDelete(hotel.city)
    }
    // check if there is any hotel of the same type left
    const numberOfHotelType = await Hotel.find({type: hotel.type})
    if (numberOfHotelType.length == 0) {
      await HotelType.findByIdAndDelete(hotel.type)
    }
    // // console.log('rooms deleted: ', result)
    res.status(204).json("Hotel has been deleted");
  } catch (err) {
    next(err);
  }
};

// get hotels by city name
const countByCity = async (req, res, next) => {
  const citiesString = req.query.cities;
  const citiesArray = citiesString.split(",");
  try {
    const promiseList = citiesArray.map((city) => {
      return Hotel.countDocuments({ city });
    });
    const countList = await Promise.all(promiseList);

    res.status(201).json({
      data: countList,
    });
  } catch (err) {
    next(err);
  }
};

// get hotels by city name
const countByCityNew = async (req, res, next) => {
  let cityData = [];
  try {
    const countHotelsByCities = await Hotel.aggregate([
      {
        $group: {
          _id: "$city",
          numberOfHotels: { $sum: 1 },
        },
      },
    ]);

    const cities = await City.find();

    countHotelsByCities?.forEach((city) => {
      let cityObj = {};
      cities?.forEach((cityFromDB) => {
        if (JSON.stringify(city._id) == JSON.stringify(cityFromDB._id)) {
          cityObj.cityName = cityFromDB.cityName;
          cityObj.numberOfHotels = city.numberOfHotels;
          if (cityFromDB.photo) {
            cityObj.photo = cityFromDB.photo;
          }

          cityData.push(cityObj);
        }
      });
    });

    // console.log("Recieved request from frontend")
    res.status(200).json({
      data: cityData,
    });
  } catch (err) {
    next(err);
  }
};

// get hotels by type
const countByType = async (req, res, next) => {
  try {
    const hotelCount = await Hotel.countDocuments({ type: "Hotel" });
    const apartmentCount = await Hotel.countDocuments({ type: "Apartment" });
    const resortCount = await Hotel.countDocuments({ type: "Resort" });
    const villaCount = await Hotel.countDocuments({ type: "Villa" });
    const cabinCount = await Hotel.countDocuments({ type: "Cabin" });

    res.status(201).json([
      { type: "Hotel", count: hotelCount },
      { type: "Apartment", count: apartmentCount },
      { type: "Resort", count: resortCount },
      { type: "Villa", count: villaCount },
      { type: "Cabin", count: cabinCount },
    ]);
  } catch (err) {
    next(err);
  }
};
// get hotels by type
const countByTypeNew = async (req, res, next) => {
  let hotelTypeData = [];
  try {
    const countHotelsByType = await Hotel.aggregate([
      {
        $group: {
          _id: "$type",
          numberOfHotels: { $sum: 1 },
        },
      },
    ]);

    const hotelTypes = await HotelType.find();

    countHotelsByType?.forEach((hotel) => {
      let typeObj = {};
      hotelTypes?.forEach((hotelFromDB) => {
        if (JSON.stringify(hotel._id) == JSON.stringify(hotelFromDB._id)) {
          typeObj.hotelType = hotelFromDB.hotelType;
          typeObj.numberOfHotels = hotel.numberOfHotels;
          if (hotelFromDB.photo) {
            typeObj.photo = hotelFromDB.photo;
          }

          hotelTypeData.push(typeObj);
        }
      });
    });

    res.status(200).json({
      data: hotelTypeData,
    });
  } catch (err) {
    next(err);
  }
};

// get rooms in a specific hotel
const getHotelRooms = async (req, res, next) => {
  try {
    const hotel = await Hotel.findById(req.params.hotel_id);
    if (!hotel)
      return next("fail", createError(400, "this hotel does not exist"));
    // get the array with room ids in this particular hotel
    const roomIdsArray = hotel.room_ids;

    const promiseList = roomIdsArray.map((roomId) => {
      return Room.findById(roomId).populate({
        path: "hotel",
        select: "name city",
      });
    });
    const RoomTypeArray = await Promise.all(promiseList);

    res.status(200).json({
      data: RoomTypeArray,
    });
  } catch (err) {
    next(err);
  }
};

// hotel statistics
const getHotelStats = async (req, res, next) => {
  try {
    const stats = await Hotel.aggregate([
      {
        $match: { rating: { $gte: 1 } },
      },
      {
        $group: {
          _id: "$type",
          numHotels: { $sum: 1 },
          avgRating: { $avg: "$rating" },
          avgPrice: { $avg: "$cheapestPrice" },
          minPrice: { $min: "$cheapestPrice" },
          maxPrice: { $max: "$cheapestPrice" },
        },
      },
      {
        $sort: { avgPrice: 1 },
      },
      {
        $match: { _id: { $ne: "Apartment" } },
      },
    ]);

    res.status(200).json({
      data: stats,
    });
  } catch (err) {
    next(err);
  }
};

const getHotelsWithin = async (req, res, next) => {
  try {
    const { distance, latlng, unit } = req.params;

    const [lat, lng] = latlng.split(",");

    // radius of the earth is 3962.2 miles or 6378.1 km

    const radius = unit === "mi" ? distance / 3962.2 : distance / 6378.1;

    if (!lat || !lng)
      return next(
        createError(
          "fail",
          400,
          "Please provide the latitude and the longitude"
        )
      );

    const hotels = await Hotel.find({
      hotelLocation: {
        $geoWithin: {
          $centerSphere: [[lng, lat], radius],
        },
      },
    });

    res.status(200).json({
      status: "success",
      number: hotels.length,
      data: hotels,
    });
  } catch (err) {
    next(err);
  }
};

const getDistances = async (req, res, next) => {
  try {
    const { latlng, unit } = req.params;

    const [lat, lng] = latlng.split(",");

    if (!lat || !lng)
      return next(
        createError(
          "fail",
          400,
          "Please provide the latitude and the longitude"
        )
      );
    const multiplier = unit === "mi" ? 0.000621371 : 0.001;

    const hotels = await Hotel.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [lng * 1, lat * 1],
          },
          key: "hotelLocation",
          distanceField: "distanceAway",
          distanceMultiplier: multiplier,
        },
      },
      {
        $project: {
          distanceAway: 1,
          name: 1,
        },
      },
    ]);

    res.status(200).json({
      status: "success",
      number: hotels.length,
      data: hotels,
    });
  } catch (err) {
    next(err);
  }
};

// create hotel city
const createHotelCity = async (req, res, next) => {
  try {
    const hotelCity = await City.create(req.body);
    res.status(201).json({
      data: hotelCity,
    });
  } catch (err) {
    next(err);
  }
};

// create hotel type
const createHotelType = async (req, res, next) => {
  try {
    const hotelType = await HotelType.create(req.body);
    res.status(201).json({
      data: hotelType,
    });
  } catch (err) {
    next(err);
  }
};

// get all hotel cities references
const getAllHotelCityRefs = async (req, res, next) => {
  try {
    const hotelCity = await City.find();
    res.status(200).json({
      data: hotelCity,
    });
  } catch (err) {
    next(err);
  }
};

// get all hotel types references
const getAllHotelTypeRefs = async (req, res, next) => {
  try {
    const hotelType = await HotelType.find();

    res.status(200).json({
      data: hotelType,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createHotel,
  getAllHotels,
  getHotel,
  updateHotel,
  deleteHotel,
  countByCity,
  countByCityNew,
  countByType,
  countByTypeNew,
  getHotelRooms,
  getHotelStats,
  getHotelsWithin,
  getDistances,
  createHotelCity,
  createHotelType,
  getAllHotelCityRefs,
  getAllHotelTypeRefs,
  getAllHotelsWithinPriceRange,
};
