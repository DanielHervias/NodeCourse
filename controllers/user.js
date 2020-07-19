'use strict'

var bcrypt = require('bcrypt-nodejs')
var moogoosePaginate = require('mongoose-pagination')
var fs = require('fs')
var path = require('path')

var User = require('../models/user')//User es el modelo de usuario.
var Follow = require('../models/follow')
var Publication = require('../models/publication')
var jwt = require('../services/jwt')


//metodo de pruebas
function home(req, res){
    res.status(200).send({
        message: 'Hola mundo'
    })
}
function pruebas(req, res){
    res.status(200).send({
        message: 'Accion de pruebas en el servidor de NodeJS'
    })
}

// 17 => funcion para registrarse y verificar los campos
function saveUser(req,res){
    var params = req.body
    var user = new User()

    if(params.name && params.surname && params.nick && params.email && params.password){
        
        user.name = params.name
        user.surname = params.surname
        user.nick = params.nick.toLowerCase()
        user.email = params.email.toLowerCase()
        user.role = 'ROLE_USER'
        user.image = null
        // 18 => Controlar Usuarios duplicados
        User.find({ $or: [
            {email: user.email.toLowerCase()},
            {nick: user.nick.toLowerCase()}
        ]}).exec((err, users) => {
            if(err) return res.status(500).send({message: 'Error en la peticion de usuarios'})
            
            if(users && users.length >= 1){
                return res.status(200).send({message: 'El usuario que intentas registrar ya existe'})
            }else{
                // 17 => encriptacion de password
                bcrypt.hash(params.password, null, null, (arr, hash) => {
                    user.password = hash
            
                    user.save((err, userStored) => {
                        if(err) return res.status(500).send({message: 'Error al guardar el usuario'})
        
                        if(userStored){
                            res.status(200).send({user: userStored})
                        }else{
                            res.status(404).send({message: 'No se a registrado el usuario'})
                        }
                    })
                })
                //<=  17
            }
        })
        //<=  18
    }else{
        res.status(200).send({
            message: 'Envia todos los campos necesarios!!'
        })
    }   
}
//<=  17 

// 19 => funcion para logearse
function loginUser(req, res){
    var params = req.body

    var email = params.email.toLowerCase() 
    var password = params.password

    User.findOne({email: email}, (err,user) => {
        if(err) return res.status(500).send({message: 'Error en la peticion'})

        if(user){
            bcrypt.compare(password, user.password, (err,check) => {
                if(check){
                    // 21 => generamos token
                    //Observacion: al parecer .gettoken no es un metodo, sino hace referenia a poner eso en postman
                    //como si fuese un valor a enviar del formulario.
                    if(params.gettoken){
                        //generar y devolver token
                        return res.status(200).send({
                            token: jwt.createToken(user)
                        })
                    }else{
                        //devolver datos del usuario
                        
                        // 20 => impedimos que se muestre las password al hacer post
                        user.password = undefined
                        //<=  20
                        return res.status(200).send({user})
                    }
                    //<= 21
                    
                }else{
                    return res.status(404).send({message: 'El usuario no se ha podido identificar'})
                }
            }) 
        }else{
            return res.status(404).send({message: 'El usuario no se ha podido identificar!!'})
        }
    })
}
//<=  19

// 23 => Conseguir datos de un Usuario
//Cuando nos llegan datos por URL usamos .params
//Cuando nos llegan datos por Post usamos .body
function getUser(req, res){
    var userId = req.params.id 

    User.findById(userId, (err, user) => {
        if(err) return res.status(500).send({message: 'Error en la petición'})

        if(!user) return res.status(404).send({message: 'El usuario no existe'})
    //=>  36
        followThisUser(req.user.sub, userId).then((value) => {
            return res.status(200).send({
                user, 
                following: value.following,
                followed: value.followed
            })
        })
    //<=  36
        /*//=>  35
        Follow.findOne({"user": req.user.sub, "followed": userId}).exec((err, follow) => {
            if(err) return res.status(500).send({message: 'Error al comprobar el seguimiento'})

            return res.status(200).send({user, follow})
        })
    //<=  35  */      
    }) 
}
//<=  23

//=>  36
async function followThisUser(identity_user_id, user_id) {
    var following = await Follow.findOne({ user: identity_user_id, followed: user_id }).exec()
        .then((following) => {
            return following;
        })
        .catch((err) => {
            return handleError(err);
        });
    var followed = await Follow.findOne({ user: user_id, followed: identity_user_id }).exec()
        .then((followed) => {
            return followed;
        })
        .catch((err) => {
            return handleError(err);
        });
  
    return {
        following: following,
        followed: followed
    };
 }
//<=  36

// 24 Devolver un listado de usuarios paginado
function getUsers(req, res){
    var identity_user_id = req.user.sub
    
    var page = 1
    if(req.params.page){
        page = req.params.page
    }

    var itemsPerPage = 5

    User.find().sort('_id').paginate(page, itemsPerPage, (err, users, total) => {
        if(err) return res.status(500).send({message: 'Error en la petición'})

        if(!users) return res.status(404).send({message: 'No hay usuarios disponibles'})

        followUserIds(identity_user_id).then((value) => {
            return res.status(200).send({// es lo mismo q poner users: users, ab: ab ...etc
                users,
                users_following: value.following,
                users_follow_me: value.followed,
                total,
                pages: Math.ceil(total/itemsPerPage)
            })
        })
        
    })
}
//<=  24

//=>  37
async function followUserIds(user_id){ //se coloca en el select :0 para evitar q se muestren
    var following =  await Follow.find({user: user_id}).select({_id: 0, __v: 0, user: 0}).exec().then((follows) => {
        var follows_clean = []

        follows.forEach((follow) => {
            follows_clean.push(follow.followed)
        })
        
        return follows_clean
    }).catch((err) =>{
        return handleError(err)
    })

    var followed =  await Follow.find({followed: user_id}).select({_id: 0, __v: 0, followed: 0}).exec().then((follows) => {
        var follows_clean = []

        follows.forEach((follow) => {
            follows_clean.push(follow.user)
        })

        return follows_clean
    }).catch((err) => {
        return handleError(err)
    })

    return {
        following: following,
        followed: followed
    }
}
//<=  37

//=>  38
function getCounters(req, res){
    var userId = req.user.sub

    if(req.params.id){
        userId = req.params.id
    }

    getCountFollow(userId).then((value) => {
        return res.status(200).send(value)
    })
}

async function getCountFollow(user_id){//El exec() aun no sé para q sirve.
    var following = await Follow.countDocuments({user: user_id}).exec()
        .then((count) => {
            return count;
        }).catch((err) => {
            return handleError(err);
        })
        
    var followed = await Follow.countDocuments({followed: user_id}).exec()
        .then((count) => {
            return count
        }).catch((err) => {
            return handleError(err)
        })
    //=> 45
    var publications = await Publication.countDocuments({user: user_id}).exec()
        .then((count) => {
            return count
        }).catch((err) => {
            return handleError(err)
        })
        
    //<= 45
    return {
        following: following,
        followed: followed,
        publications: publications
    }
}
//<=  38

//=>  25
function updateUser(req, res){
    var userId = req.params.id
    var update = req.body

    //borrar propiedad password
    delete update.password

    if(userId != req.user.sub)
        return res.status(500).send({message: 'No tienes permiso para actualizar los datos del usuario'})

        User.findByIdAndUpdate(userId, update, {new: true},(err, userUpdated) => {
            if(err) return res.status(500).send({message: 'Error en la petición'})

            if(!userUpdated) return res.status(404).send({message: 'No se ha podido actualizar el usuario'})

            return res.status(200).send({user: userUpdated})
        })
}
//<=  25

//=>  26
function uploadImage(req, res){
    var userId = req.params.id
    
    if(req.files){
        var file_path = req.files.image.path
        console.log(file_path)

        var file_split = file_path.split('\\')
        console.log(file_split)
        
        var file_name = file_split[3]
        console.log(file_name);

        var ext_split = file_name.split('\.')
        console.log(ext_split);
        
        var file_ext = ext_split[1]
        console.log(file_ext);

        if(userId != req.user.sub)
            return removeFliesOfUploads(req, file_path, 'No tienes permiso para actualizar los datos del usuario')

        if(file_ext == 'png' || file_ext == 'jpg' || file_ext == 'jpeg' || file_ext == 'gif'){
            //=>  27 Actualizar documento de usuario logueado
            User.findByIdAndUpdate(userId, {image: file_name}, {new: true}, (err, userUpdated) => {
                if(err) return res.status(500).send({message: 'Error en la petición'})

                if(!userUpdated) return res.status(404).send({message: 'No se ha podido actualizar el usuario'})

                return res.status(200).send({user: userUpdated})
            })//<=  27
        }else{
            return removeFliesOfUploads(res, file_path, 'Extensión no válida')
        }
    }else{
        return res.status(200).send({message: 'No se han subido archivos'})
    } 
} 

function removeFliesOfUploads(res, file_path, message){
    fs.unlink(file_path, (err) => {
        return res.status(200).send({message: message})
    })
}
//<= 26

//=> 28
function getImageFile(req, res){
    var image_file = req.params.imageFile
    var path_file = '../uploads/users/' + image_file

    fs.exists(path_file, (exists) => {
        if(exists){
            res.sendFile(path.resolve(path_file))
        }else{
            res.status(200).send({message: 'No existe la imagen...'})
        }
    })
}
//<=  28



module.exports = {
    home,
    pruebas,
    saveUser,
    loginUser,
    getUser,
    getUsers,
    getCounters,
    updateUser,
    uploadImage,
    getImageFile
}
