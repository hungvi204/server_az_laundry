const UserModel = require("../models/user_model");
const bcryp = require('bcryptjs');
const asyncHandle = require('express-async-handler');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const RoleModel = require("../models/role_model");
const { initializeApp } = require("firebase/app");
const { getDownloadURL, getStorage, ref, uploadBytesResumable, deleteObject } = require('firebase/storage');
const firebaseConfig = require("../configs/firebase.config");
const ProductModel = require("../models/product_model");
const { default: axios } = require("axios");
initializeApp(firebaseConfig)
require('dotenv').config();
const storage = getStorage(undefined,"gs://az-laundry.appspot.com")

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587, // port của gmail là 587
    auth: {
        user: "duccu1403@gmail.com",
        pass: "ctda urbe beqa kjsf",
    },
})

const getJsonWebToken = (email, id) => {

    const payload = {
        email,
        id,
    };

    const token = jwt.sign(payload, process.env.SECRET_KEY, {
        expiresIn: '7d', // thời hạn sau khi đăng kỳ tài khoản người dùng bắt buộc đăng nhập lại
    })
    return token;
}

const handleSendMail = async (val) => {

    try {
        await transporter.sendMail(val);

        return 'Done';
    } catch (error) {
        return error
    }
};

//  khi sử dụng asyncHandle thì không cần sử dụng try catch
const verification = asyncHandle(async (req, res) => {
    const { email } = req.body;
    const verificationCode = Math.round(1000 + Math.random() * 9000);

    try {
        const data = {
            from: `AZ_Laundry <duccu1403@gmail.com>`,
            to: email, 
            subject: "Verification email code", 
            text: "Your code to verificayion email", 
            html: `<h1>${verificationCode}</h1>`, 
        }
        await handleSendMail(data);

        res.status(200).json({
            message: 'Send verification code successfully!',
            data: {
                code: verificationCode,
            },
        })
    } catch (error) {
        res.status(401);
        throw new Error('Can not send email!')
    }
});

const register = asyncHandle(async (req, res) => {
    const { email, fullname, password ,name_role} = (req.body);
    // kiểm tra xem email có bị trùng lặp hay không(email đã đăng ký tài khoản)
    const existingUser = await UserModel.findOne({ email }).populate('role_id');
    const defaultRole = await RoleModel.findOne({ name_role: name_role??"user" });
    if(!defaultRole){
        res.status(401)
        throw new Error(`role not found`)
    }
    // nếu có user thì trả ra lỗi
    if (existingUser) {
        res.status(401)
        throw new Error(`User has already exist!!!`)
    }

    // Mã hóa mật khẩu 
    const salt = await bcryp.genSalt(10);

    const hashedPassword = await bcryp.hash(password, salt)

    const newUser = new UserModel({
        fullname: fullname ?? '',
        email,
        password: hashedPassword,
        role_id:defaultRole._id
    })

    // lưu vào database
    await newUser.save()

    const userWithRole = await UserModel.findById(newUser.id).populate('role_id');
    res.status(200).json({
        message: "Register new user successfully",
        data: {
            fullname:userWithRole.fullname,
            email: userWithRole.email,
            id: userWithRole.id,
            role_id:userWithRole.role_id,
            accesstoken: await getJsonWebToken(email, userWithRole.id),
        }
    });
});

const login = asyncHandle(async (req, res) => {
    const { email, password } = req.body;

    // Tìm người dùng theo email và populate role_id
    const existingUser = await UserModel.findOne({ email }).populate('role_id');
    if (!existingUser) {
        return res.status(403).json({
            message:'User not found'
        });
    }

    // Kiểm tra mật khẩu
    const isMatchPassword = await bcryp.compare(password, existingUser.password);
    if (!isMatchPassword) {
        return res.status(401).json({
            message:'Email or Password is not correct!'
        });
    
    }

    // Trả về vai trò thực tế của người dùng thay vì gán vai trò mặc định
    return res.status(200).json({
        message: 'Login successfully',
        data: {
            id: existingUser.id,
            fullname: existingUser.fullname,
            email: existingUser.email,
            role_id: existingUser.role_id, // Lấy role_id từ cơ sở dữ liệu
            accesstoken: await getJsonWebToken(email, existingUser.id),
        },
    });
});

const forgotPassword = asyncHandle(async(req, res) => {
    const {email} = req.body;

    const randomPassword = Math.round(100000 + Math.random() * 99000);
    const data = {
        from: `Mật Khẩu Mới <duccu1403@gmail.com>`, 
        to: email, 
        subject: "Verification email code", 
        text: "Your code to verificayion email", 
        html: `<h1>${randomPassword}</h1>`, 
    }

    // cập nhật mật khẩu mới của người dùng vào tài khoản. Kiểm tra xem trên local có tài
    // khoản hay không bằng UserModel.findOne
    const user = await UserModel.findOne({email})
    if(user) {
        // nếu có user bắt đầu mã hóa lại mật khẩu mà người dùng gửi xuống
        const salt = await bcryp.genSalt(10);

        const hashedPassword = await bcryp.hash(`${randomPassword}`, salt);

        await UserModel.findByIdAndUpdate(user._id, {
            password: hashedPassword,
            isChangePassword: true
        }).then(() => {
            console.log('Xong')
        }).catch((error) => console.log(error));

        await handleSendMail(data).then(() => {
            res.status(200).json({
                message: 'Gửi mật khẩu mới thành công!',
                data: []
            });
        }).catch((error) => {
            res.status(401);
            throw new Error('Không thể gửi mật khẩu mới!')
        });
    } else {
        res.status(401);
        throw new Error('Không tìm thấy tài khoản!');
    }
});


const getUserData = asyncHandle(async (req, res) => {

    try {
        const user = await UserModel.find().populate("role_id");
        res.status(200).json(user);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({
            message: 'Internal Server Error',
            error: error.message,
        });
    }
});

const getUserById= asyncHandle(async (req, res) => {
    const {  id_user } = req.query; 
    const user = await UserModel.find({_id:id_user}).populate("role_id")
    try {
        if(user){
            res.status(200).json(user);
        }else{
            res.status(400).json({
                message: 'lỗi user ',
            }); 
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).json({
            message: 'Internal Server Error',
            error: error.message,
        });
    }
});


const handleLoginWithGoogle = asyncHandle(async(req, res) => {
    const userInfo = req.body;
    let newUser;
    const defaultRole = await RoleModel.findOne({ name_role: "user" });
    const existingUser = await UserModel.findOne({ email:userInfo.email }).populate('role_id');
    let user = {...userInfo}
        if(existingUser) {
           if(existingUser.role_id.name_role==="user"){
            const updatedUserInfo = {
                ...userInfo,
                photo: existingUser.photo || userInfo.photo, 
                updatedAt: Date.now()
            };
                await UserModel.findByIdAndUpdate(existingUser.id, updatedUserInfo)
                console.log('Update done')
                user.accesstoken = await getJsonWebToken(userInfo.email, userInfo.id,)
           }else{
                res.status(400).json({
                    message: 'Người dùng không có vai trò thích hợp để đăng nhập với bên thứ ba',
                    log: `User with email ${userInfo.email} has role ${existingUser.role_id.name_role}`
                });
           }
        } else {
            newUser = new UserModel({
                fullname: userInfo.name,
                email: userInfo.email,
                role_id:defaultRole._id,
                ...userInfo
            })
            await newUser.save();
            user.accesstoken = await getJsonWebToken(userInfo.email, newUser.id)
        }
        
        res.status(200).json({
            massage: 'Login with google successfully',
            data: {...user, id: existingUser ? existingUser.id : newUser._id,role_id:defaultRole,fullname:existingUser?existingUser.fullname:newUser.fullname }, 
        })

    // Ở đây nó không lấy được id từ mongodb mà nó chỉ lấy được id của tài khoản gg vì vậy mình cần lấy thêm id khi người dùng 
    // đăng nhập bằng gg trong mongodb thành công lúc đó mới đặt hàng được.
})
const createUser = asyncHandle(async (req, res) => {
    if (!req.files || !req.files.thumbnail || !req.files.shop_banner) {
        return res.status(400).json({ message: 'Both thumbnail and shop_banner images are required.' });
    }
    const thumbnailFile = req.files.thumbnail[0]; 
    const thumbnailRef = ref(storage, `shops/thumbnails/${thumbnailFile.originalname}`);
    const thumbnailMetadata = { contentType: thumbnailFile.mimetype };
    const thumbnailSnapshot = await uploadBytesResumable(thumbnailRef, thumbnailFile.buffer, thumbnailMetadata);
    const thumbnailURL = await getDownloadURL(thumbnailSnapshot.ref);

    const bodyImageFile = req.files.shop_banner[0]; 
    const bodyImageRef = ref(storage, `shops/shop-banner/${bodyImageFile.originalname}`);
    const bodyImageMetadata = { contentType: bodyImageFile.mimetype };
    const bodyImageSnapshot = await uploadBytesResumable(bodyImageRef, bodyImageFile.buffer, bodyImageMetadata);
    const bodyImageURL = await getDownloadURL(bodyImageSnapshot.ref);

    const { email, fullname, password, shop_name, address } = req.body;
    
    const roleShop = await RoleModel.findOne({ name_role: "shop" });

    
    if (!shop_name ) {
        return res.status(400).json({
            message: "data_user object must contain shop_name"
        });
    }

    const existingUser = await UserModel.findOne({ email }).populate('role_id');
    if (existingUser) {
        res.status(401);
        throw new Error('User already exists!!!');
    }
    console.log(email)
    const salt = await bcryp.genSalt(10);
    const hashedPassword = await bcryp.hash(password, salt);
    if( email || fullname || password || address){
        const openCageUrl = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(address)}&key=${process.env.API_KEY_MAP}`;
        const response = await axios.get(openCageUrl);
        if(response.data.results?.length>0){
            const location = response?.data?.results[0]?.geometry;
            const newUser = new UserModel({
                fullname: fullname ?? '',
                email,
                password: hashedPassword,
                role_id: roleShop._id,
                address,
                location: {
                    type: 'Point',
                    coordinates: [location.lng, location.lat], // Đảm bảo là longitude trước, latitude sau
                },
                data_user: {
                    shop_name:shop_name,
                    thumbnail: thumbnailURL,
                    shop_banner: bodyImageURL,
                }
            });
            await newUser.save();
            const userWithRole = await UserModel.findById(newUser.id).populate('role_id');

            res.status(200).json({
                message: "Create new user successfully",
                data: {
                    fullname: userWithRole.fullname,
                    email: userWithRole.email,
                    id: userWithRole.id,
                    role_id: userWithRole.role_id,
                    address:userWithRole.address,
                    location:userWithRole.location,
                    data_user: userWithRole.data_user,
                    accesstoken: await getJsonWebToken(email, userWithRole.id),
                }
            });
        }
    }else{
        res.status(400).json({ message: 'Lỗi dữ liệu', error: error.message });
    }
});

const getShops = asyncHandle(async (req, res) => {
    const { currentLatitude, currentLongitude, limit } = req.body;

    try {
        let getShops;

        const roleShop = await RoleModel.findOne({ name_role: "shop" });

        if (currentLongitude && currentLatitude) {
            // Nếu có tọa độ, tìm kiếm gần theo geo
            const aggregatePipeline = [
                {
                    // Tìm kiếm gần bằng geo
                    $geoNear: {
                        near: {
                            type: 'Point',
                            coordinates: [currentLongitude, currentLatitude], // Tọa độ của người dùng
                        },
                        distanceField: 'distance', // Trường lưu khoảng cách
                        spherical: true,
                    },
                },
                {
                    $match: {
                        role_id: roleShop._id
                    },
                },
            ];

            // Chỉ thêm $limit nếu limit được cung cấp và lớn hơn 0
            if (limit > 0) {
                aggregatePipeline.push({ $limit: limit });
            }

            getShops = await UserModel.aggregate(aggregatePipeline);
        } else {
            // Khi không có tọa độ, tìm kiếm tất cả
            getShops = await UserModel.find({ role_id: roleShop._id }).limit(limit||0);

            // Giới hạn số kết quả nếu có limit
            
        }

        res.status(200).json({
            "messenger": "Thành công",
            "data": getShops
        });
    } catch (error) {
        console.error('Error fetching shops: ', error);
        res.status(500).json({ message: 'Lỗi khi truy vấn', error: error.message });
    }
});




const createAdminIfNotExists = asyncHandle(async()=>{
    const existingUser = await UserModel.findOne({ email: 'admin@gmail.com' }).populate('role_id');
    const defaultRole = await RoleModel.findOne({ name_role: "admin" });

    if (!defaultRole) {
        console.error('Role not found');
        return;
    }

    // Nếu không có user, tạo user mới
    if (!existingUser) {
        const salt = await bcryp.genSalt(10);
        const hashedPassword = await bcryp.hash('admin123', salt);

        const newAdmin = new UserModel({
            fullname: 'admin',
            email: "admin@gmail.com",
            password: hashedPassword,
            role_id: defaultRole._id
        });

        await newAdmin.save();
        console.log('Tạo thành công admin');
    }
})


const getShopsByProductType = asyncHandle(async (req, res) => {
    const { id_product_type, currentLatitude, currentLongitude } = req.body;
    try {
        // 1. Tìm sản phẩm có `id_product_type` và lấy danh sách `id_user`
        const products = await ProductModel.find({ id_product_type }).select('id_user');
        const userIds = products.map(product => product.id_user); // Lấy danh sách `id_user`

        if (!userIds.length) {
            return res.status(404).json({ message: "Không tìm thấy shop nào cho product_type này." });
        }

        // 2. Tìm role của shop
        const roleShop = await RoleModel.findOne({ name_role: "shop" });

        // 3. Tạo pipeline tìm kiếm shop, nếu có tọa độ, thêm $geoNear
        const aggregatePipeline = [];

        if (currentLatitude && currentLongitude) {
            aggregatePipeline.push({
                // Tìm shop gần nhất theo vị trí
                $geoNear: {
                    near: {
                        type: 'Point',
                        coordinates: [currentLongitude, currentLatitude], // Tọa độ của người dùng
                    },
                    distanceField: 'distance', // Trường chứa khoảng cách tính được
                    spherical: true,
                },
            });
        }

        // 4. Lọc shop theo `id_user` và role
        aggregatePipeline.push(
            {
                $match: {
                    _id: { $in: userIds }, // Lọc theo danh sách `id_user`
                    role_id: roleShop._id, // Chỉ lấy user có role là shop
                },
            },
            {
                $project: {
                    fullname: 1,
                    email: 1,
                    phone_number: 1,
                    address: 1,
                    "data_user.shop_name": 1,
                    "data_user.thumbnail": 1,
                    "data_user.shop_banner": 1,
                    "data_user.star_rating": 1,
                    "data_user.order_count": 1,
                    distance: 1,
                    location:1 // Nếu có geoNear, sẽ trả về distance
                },
            }
        );

        // 5. Thực thi truy vấn với pipeline
        const shops = await UserModel.aggregate(aggregatePipeline);

        return res.status(200).json({
            message: "Lấy shop thành công",
            data: shops,
        });

    } catch (error) {
        console.error('Lỗi khi lấy shop: ', error);
        res.status(500).json({ message: 'Lỗi khi truy vấn shop', error: error.message });
    }
});

const findUserId = asyncHandle(async (req, res) => {
    const userId = req.params.userId;
    try {
      const user = await UserModel.findById(userId)
      res.status(200).json(user);
    } catch (error) {
      console.log(error);
      res.status(500).json(error);
    }
  });
const addAddressByIdUser = asyncHandle(async(req,res)=>{
    const {id_user, address,addToStart,longitude,latitude,full_name,phone_number }= req.body
    
    const user = await UserModel.findById({_id:id_user});
    if (!user) {
        return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
    }
    try {
        let newLocation ={}
        if (!address && latitude && longitude) {
            const openCageUrl = `https://api.opencagedata.com/geocode/v1/json?q=${latitude}+${longitude}&key=${process.env.API_KEY_MAP}`;
            const response = await axios.get(openCageUrl);
            if(response){
                newLocation = {
                    full_name:user.fullname,
                    phone_number:user.phone_number??phone_number,
                    address: response.data.results[0].formatted,
                    location: {
                        type: 'Point',
                        coordinates: [latitude, longitude] 
                    }
                };
            }
            
        }else{
            const openCageUrl = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(address)}&key=${process.env.API_KEY_MAP}`;
            const response = await axios.get(openCageUrl);
            
            if(response){
                if (response.data.results?.length>0) {
                    console.log('dsa');
                    
                    const location = response?.data?.results[0]?.geometry;
                    newLocation = {
                        full_name:full_name,
                        address: address,
                        phone_number:phone_number,
                        location: {
                            type: 'Point',
                            coordinates: [location.lat, location.lng] 
                        }
                    };
                  } else {
                    return res.status(404).json({ message: "Không tìm thấy địa chỉ." });
                  }
                
            }
        }
        if (addToStart) {
            if (user.list_addresses.length > 0) {
                user.list_addresses[0] = newLocation; 
            } else {
                user.list_addresses.push(newLocation);
            }
        } else {
            user.list_addresses.push(newLocation);
        }
        await user.save();
        res.status(200).json({
            list_addresses: user
        });
    } catch (error) {
        console.log(error);
        
    }
})

const deleteListAddresses = asyncHandle(async(req,res)=>{
    const {idUser, idListAddresses}= req.params
    const result = await UserModel.updateOne(
        { _id: idUser }, 
        { $pull: { list_addresses: { _id: idListAddresses} } } 
    )
    if (result.modifiedCount > 0) {
        return res.status(200).json({
            message: "Xóa thành công",
        });
    } else {
        return res.status(404).json({
            message: "Xóa thất bại. Kiểm tra lại idUser hoặc idListAddresses.",
        });
    }
})



const updateDeviceToken=asyncHandle(async(req,res)=>{
    const {id}=req.params;
        const {device_token} = req.body;
        const result = await UserModel.findByIdAndUpdate(id,{device_token:device_token});
        if(result){
            res.json({
                "status": 200,
                "messenger": "update device token",
                "data": result
            })
        }else{
            res.status(401);
            throw new Error("Lỗi")
        }
})

const changePassword = asyncHandle(async (req, res) => {
    const { userId, oldPassword, newPassword } = req.body;

    // Lấy người dùng và mật khẩu hiện tại
    const user = await UserModel.findById(userId, "password");
    if (!user) {
        return res.status(404).json({ message: "User not found!" });
    }

    // Kiểm tra nếu người dùng không có mật khẩu (Google/Facebook)
    if (!user.password) {
        return res.status(400).json({
            message: "Cannot change password for accounts created with Google or Facebook.",
        });
    }

    // Kiểm tra mật khẩu hiện tại
    const isMatchPassword = await bcryp.compare(oldPassword, user.password);
    if (!isMatchPassword) {
        return res.status(401).json({ message: "Mật khẩu cũ không đúng!" });
    }

    // Cập nhật mật khẩu mới
    const hashedPassword = await bcryp.hash(newPassword, 10);
    await UserModel.findByIdAndUpdate(userId, { password: hashedPassword });

    res.status(200).json({ message: "Password changed successfully" });
});


const updateInfo = asyncHandle(async (req, res) => {
    const { userId, phone_number, address, fullname } = req.body;

    // Tạo đối tượng chỉ chứa các trường cần cập nhật
    const updateData = {};
    if (phone_number) updateData.phone_number = phone_number;
    if (address) updateData.address = address;
    if (fullname) updateData.fullname = fullname;
    console.log(req.files);
    console.log(req.body);
        // Lấy thông tin người dùng để xử lý file cũ
        const user = await UserModel.findById(userId);
   // Nếu có file hình được upload
   if (req.files) {
         // Xóa file cũ trên Firebase nếu tồn tại
         // Kiểm tra xem ảnh cũ có phải từ Firebase
    if (user?.photo?.includes('firebasestorage.googleapis.com')) {
        const photoPath = user.photo.split('/o/')[1].split('?')[0]; // Lấy path từ URL Firebase
        const oldPhotoRef = ref(storage, decodeURIComponent(photoPath)); // Decode %2F thành /

        try {
            await deleteObject(oldPhotoRef);
            console.log("Old photo deleted successfully");
        } catch (error) {
            console.error("Error deleting old photo:", error);
        }
    } else {
        console.log("Old photo is not stored in Firebase, skipping delete.");
    }
    const file = req.files[0]; // Hình ảnh từ request
    const storageRef = ref(storage, `users/${userId}_${file.originalname}`); // Định danh file theo userId
    const metadata = { contentType: file.mimetype };

    try {
        const snapshot = await uploadBytesResumable(storageRef, file.buffer, metadata); // Upload lên Firebase
        const downloadURL = await getDownloadURL(snapshot.ref); // Lấy URL tải xuống
    console.log("Download URL:", downloadURL);
        updateData.photo = downloadURL; // Lưu URL vào database
    } catch (error) {
        return res.status(500).json({ message: "Error uploading image", error });
    }
    }

    // Cập nhật thông tin người dùng
    const updatedUser = await UserModel.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, fields: "phone_number address fullname photo" } 
    );
    console.log("Uploaded file:", req.files);
    console.log("Update data with photo:", updateData);
    console.log("Updated user:", updatedUser);
    if (!updatedUser) {
        return res.status(404).json({ message: "User not found!" });
    }

    res.status(200).json({
        status: 200,
        message: "User information updated successfully",
        data: updatedUser,
    });
});


module.exports = {
    register,
    login,
    verification,
    forgotPassword,
    getUserData,
    handleLoginWithGoogle,
    createAdminIfNotExists,
    createUser,
    getShops,
    getUserById,
    getShopsByProductType, 
    findUserId, 
    updateDeviceToken,
    addAddressByIdUser,
    deleteListAddresses,
    changePassword,
    updateInfo
}