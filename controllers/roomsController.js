const createError = require("./../utils/error");
const Room = require("./../models/rooms");
const Hotel = require("./../models/hotels");
// const Booking = require("./../models/bookings");
const rabbitMQ_connection = require('../utils/producer')

const exchangeName = "topic_logs";
const exchangeType = 'topic';
const routing_key = ['hotels.roomsBookings.deleteMany']
let channel_rooms_producer;

const sendTask = async () => {
  const connection = await rabbitMQ_connection()
  channel_rooms_producer = await connection.createChannel();
  await channel_rooms_producer.assertExchange(exchangeName, exchangeType, {durable: false});
  // console.log("Connected to rabbitMQ authServices")
}

sendTask();


const createRoom = async (req, res, next) => {
  try {
    // check if the hotel exist
    const hotelExists = await Hotel.findById(req.body.hotel);
    if (!hotelExists)
      return next(
        createError("fail", 404, "the hotel you specified does not exist")
      );

    const room = await Room.create(req.body);
    const hotel = await Hotel.findByIdAndUpdate(req.body.hotel, {
      $push: { room_ids: room._id },
    });

    res.status(201).json({
      success: true,
      data: room,
    });
  } catch (err) {
    next(err);
  }
};

const updateRoom = async (req, res, next) => {
  try {

    let updatedRoomTitle = await Room.findById(req.params.room_id)
    let bookings;
    if (req.body.hotel) {
      // Check if the given hotel exists
      const hotelNew = await Hotel.findById(req.body.hotel);
      if (!hotelNew)
        return next(
          createError("fail", 404, "the hotel you specified does not exist")
        );

      // find the current hotel associated with the room title and delete the room title with its rooms
      const hotelCurrent = await Hotel.findOneAndUpdate(
        { room_ids: req.params.room_id },
        { $pull: { room_ids: req.params.room_id } }
      );
      // // console.log('hotelCurrent: ', hotelCurrent)
      if (!hotelCurrent)
        return next(
          createError(
            "fail",
            404,
            "the hotel associated with this room does not exist"
          )
        );

      // update the given hotel with the room title
      const hotelGiven = await Hotel.findByIdAndUpdate(hotelNew._id, {
        $push: { room_ids: req.params.room_id },
      });

      // set all the unavailable dates to empty arrays
    //   const updatedRoomTitle = await Room.findById(req.params.room_id)
      updatedRoomTitle.roomNumbers = updatedRoomTitle.roomNumbers.map(roomNumber => (
        {...roomNumber, unavailableDates: []}
      ))

      updatedRoomTitle = await updatedRoomTitle.save()

      //   // console.log('hotel: ', hotel)
      bookings = await Booking.deleteMany({
        "bookingDetails.roomType_id": req.params.room_id,
      });
 
    } else if (req.body.removeRooms) {
        const roomsArray = (req.body.removeRooms).split(',')
        let trimmedRooms = roomsArray.map(room => (room.trim() * 1))
        // const newRoomTitle = await Room.findById(req.params.room_id)
        updatedRoomTitle.roomNumbers = updatedRoomTitle.roomNumbers.filter(roomNumber => !(trimmedRooms.includes(roomNumber.number)))
        // console.log('updatedRoomTitle: ', updatedRoomTitle)
        updatedRoomTitle = await updatedRoomTitle.save()

        // continue tomorrow
        // delete the bookings associated with these rooms
        // bookings = await Booking.deleteMany({
        //     "bookingDetails.roomType_id": req.params.room_id, "bookingDetails.roomNumber": {$in : trimmedRooms}
        //   });
          channel_rooms_producer.publish(exchangeName, routing_key[0], Buffer.from(JSON.stringify({ 
            "bookingDetails.roomType_id": req.params.room_id, "bookingDetails.roomNumber": {$in : trimmedRooms} 
          })));
        //   if (!bookings)
        //     return next(
        //       createError("fail", 404, "the booking you specified does not exist")
        //     );
        //   // console.log("bookings: ", bookings);

    }


    let roomNumbers = [];
    if (req.body.addRooms) {

        const givenRoomNumbers = (req.body.addRooms).split(",");
    givenRoomNumbers?.forEach(givenRoom => {
      let Obj = {}
      Obj.number = givenRoom * 1
      Obj.unavailableDates = []
      roomNumbers.push(Obj)
    })
   
    // console.log(roomNumbers);
    updatedRoomTitle.roomNumbers = [...updatedRoomTitle.roomNumbers, ...roomNumbers]
    // console.log('updatedRoomTitle.roomNumbers: ', updatedRoomTitle.roomNumbers);
    }

    if (req.body.title) updatedRoomTitle.title = req.body.title
    if (req.body.price) updatedRoomTitle.price = req.body.price * 1
    if (req.body.maxPeople) updatedRoomTitle.maxPeople = req.body.maxPeople * 1
    if (req.body.description) updatedRoomTitle.description = req.body.description

    const roomData = await updatedRoomTitle.save()
 
    res.status(200).json({
      success: true,
      data: roomData
    });
  } catch (err) {
    next(err);
  }
  
};

// const updateRoomAvailability = async (req, res, next) => {
//     try {
//         await Room.updateOne(
//             { "roomNumbers._id": req.params.id },
//             {
//                 $push: {
//                     "roomNumbers.$.unavailableDates": req.body.dates
//                 },
//             }
//         );
//         res.status(200).json("Room status has been updated.");
//     } catch (err) {
//         next(err);
//     }
// };

const updateRoomAvailability = async (req, res, next) => {
  // // console.log(req.body.reservedDates)

  const compareNumbers = (a, b) => {
    return new Date(a).getTime() - new Date(b).getTime();
  };
  try {
    // get the room style to update
    const roomStyle = await Room.findOne({
      "roomNumbers._id": req.params.room_id,
    });
    // // console.log(roomStyle)
    // get the room to update
    // // console.log(roomStyle.roomNumbers[0]?._id)
    const room = roomStyle.roomNumbers.find(
      ({ _id }) => _id == req.params.room_id
    );
    // // console.log(room)

    // update the unavailable dates for the room
    const unavailableDates = room.unavailableDates.concat(
      req.body.reservedDates
    );
    // // console.log(unavailableDates)
    if (unavailableDates.length >= 2) {
      unavailableDates.sort(compareNumbers);
    }

    // room.unavailableDates = [...unavailableDates]
    roomStyle.roomNumbers = roomStyle.roomNumbers.map((roomNumber) => {
      if (roomNumber._id == req.params.room_id) {
        return {
          ...roomNumber,
          unavailableDates: [...unavailableDates],
        };
      } else return roomNumber;
    });

    // // console.log(roomStyle)

    // save the updated room
    await roomStyle.save();

    res.status(200).json("Room status has been updated.");
  } catch (err) {
    next(err);
  }
};

const deleteRoom = async (req, res, next) => {
  let room;
  let hotel;
  let booking;
  try {
    room = await Room.findByIdAndDelete(req.params.room_id);
    if (!room)
      return next(
        createError("fail", 404, "the room you specified does not exist")
      );
    hotel = await Hotel.findByIdAndUpdate(room.hotel, {
      $pull: { room_ids: req.params.room_id },
    });
    if (!hotel)
      return next(
        createError("fail", 404, "the hotel you specified does not exist")
      );

    // const bookings = await Booking.deleteMany({
    //     "bookingDetails.roomType_id": req.params.room_id,
    //   })

      channel_rooms_producer.publish(exchangeName, routing_key[0], Buffer.from(JSON.stringify({ "bookingDetails.roomType_id": req.params.room_id })));



    res.status(204).json("Room has been deleted.");
  } catch (err) {
    next(err);
  }
};

const getRoom = async (req, res, next) => {
  try {
    const room = await Room.findById(req.params.room_id).populate('hotel', 'name').exec();
    // const room = await Room.findById(req.params.room_id).populate({
    //   path: "hotel",
    //   select: "-type -city -description -detailedDescription -closestTouristLocation -distanceToClosestTouristLocation -photos -photo_id -numberOfRatings -ratingsAverage -room_ids -cheapestPrice -vipPrice -secretBranch -manager -staff",
    // }).exec();
    // const room = await Room.findById(req.params.room_id)
    if (!room)
      return next(
        createError("fail", 404, "the room you specified does not exist")
      );
    res.status(200).json({
      success: true,
      data: room,
    });
  } catch (err) {
    next(err);
  }
};

const getAllRooms = async (req, res, next) => {
  try {
    const rooms = await Room.find().populate('hotel', 'name').exec()
    // const rooms = await Room.find().populate({
    //   path: "hotel",
    //   select: "name",
    // });
    res.status(200).json({
      number: rooms.length,
      data: rooms,
    });
  } catch (err) {
    next(err);
  }
};




const getRoomDetails = async (req, res, next) => {
  try {
    const roomTypeArray = await Room.find({
      "roomNumbers._id": { $in: req.body.selectedRooms },
    }).populate({
      path: "hotel",
      select: "name",
    });

    res.status(200).json({
      number: roomTypeArray.length,
      data: roomTypeArray,
    });
  } catch (err) {
    next(err);
  }
};


module.exports = {
  createRoom,
  updateRoom,
  updateRoomAvailability,
  deleteRoom,
  getRoom,
  getAllRooms,
  getRoomDetails
};
