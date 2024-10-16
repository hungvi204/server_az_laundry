const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    fullname: {
        type: String,
    },
    givenName: {
        type: String,
    },
    familyName: {
        type: String,
    },
    photo: {
        type: String,
    },
    email: {
        type: String,
        require: true
    },
    password: {
        type: String,
        require: true
    },
    phone_number: {
        type : String,
    },
    address: {
        type: String,
    },
    data_user: {
        shop_name: {
            type: String,
        },
        thumbnail: {
            type: String,
        },
        shop_banner: {
            type: String,
        },
        star_rating: {
            type: Number, 
        },
        order_count: {
            type: Number, 
        }
    },
    location: {
        type: {
            type: String, // Kiểu 'Point'
            enum: ['Point'], // Chỉ cho phép 'Point'
            required: true,
        },
        coordinates: {
            type: [Number], // longitude trước, latitude sau
            required: true,
        },
    },
    role_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "role",
    },
}, {
    timestamps: true
});
UserSchema.index({ location: '2dsphere' });
const UserModel = mongoose.model('user', UserSchema);

module.exports = UserModel;