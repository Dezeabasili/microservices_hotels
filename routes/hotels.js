const express = require('express')
const fileUpload = require('express-fileupload')
const upload_file = require('./../controllers/uploadfile')
const generateSignature = require('./../controllers/cloudinaryController')
const router = express.Router()
const hotelsController = require('./../controllers/hotelsController')
const roomsController = require('./../controllers/roomsController')
const verifyAccessToken = require('./../middlewares/verifyJWT')
const verifyRoles = require('./../middlewares/verifyRoles')
// const reviewsRouter = require('./reviews')

// router.use('/:hotel_id/reviews', reviewsRouter)

router.route('/')
    .post(verifyAccessToken, verifyRoles(2030), hotelsController.createHotel)
    .get(hotelsController.getAllHotels)

    


router.get('/hotelstats/stats', hotelsController.getHotelStats)

router.get('/hotelswithin/:distance/center/:latlng/unit/:unit', hotelsController.getHotelsWithin)

router.get('/hotelsdistances/center/:latlng/unit/:unit', hotelsController.getDistances)

router.get('/countbycity/cityname', hotelsController.countByCity)
router.get('/countbycity', hotelsController.countByCityNew)
router.get('/countbytype/all', hotelsController.countByType)
router.get('/countbytype', hotelsController.countByTypeNew)


router.get('/allcityrefs', hotelsController.getAllHotelCityRefs)
router.get('/allhoteltyperefs', hotelsController.getAllHotelTypeRefs)
router.post('/createcity', verifyAccessToken, verifyRoles(2030), hotelsController.createHotelCity)
router.post('/createhoteltype', verifyAccessToken, verifyRoles(2030), hotelsController.createHotelType)
router.get('/price', hotelsController.getAllHotelsWithinPriceRange)

router.post('/upload', verifyAccessToken, fileUpload({ createParentPath: true }), upload_file)
router.post('/generatesignature', verifyAccessToken, generateSignature)




    router.post('/room', verifyAccessToken, verifyRoles(2030), roomsController.createRoom)

    router.get('/allrooms', roomsController.getAllRooms)

    router.post('/roomdetails', roomsController.getRoomDetails)
    
    router.route('/gpdroom/:room_id')
        .get(roomsController.getRoom)
        .patch(verifyAccessToken, verifyRoles(2030), roomsController.updateRoom)
        .delete(verifyAccessToken, verifyRoles(2030), roomsController.deleteRoom)
    
    router.patch('/room/availability/:room_id', roomsController.updateRoomAvailability)

    router.route('/:hotel_id')
    .get(hotelsController.getHotel)
    .patch(verifyAccessToken, verifyRoles(2030), hotelsController.updateHotel)
    .delete(verifyAccessToken, verifyRoles(2030), hotelsController.deleteHotel)

    

    router.get('/room/:hotel_id', hotelsController.getHotelRooms)

module.exports = router