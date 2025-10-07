const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");


cloudinary.config({

    cloud_name: 'di1bf8n5p',
    api_key: '756854938742942',
    api_secret: 'uzBfUbHaIJ_7MVosR-N695UajT0',
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "profiles",  
    allowed_formats: ["jpg", "jpeg", "png"],
  },
});

module.exports = {
  cloudinary,
  storage,
};
