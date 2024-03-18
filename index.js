const express = require("express");
const PORT = 3000;
const app = express();
const multer = require('multer');
const AWS = require('aws-sdk')
require('dotenv').config();
const path = require('path');
const { log } = require("console");

AWS.config.update({
    region: process.env.REGION,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    accessKeyId: process.env.ACCESS_KEY_ID
});

const s3 = new AWS.S3();
const dymamodb = new AWS.DynamoDB.DocumentClient();
const tableName = "Courses"
app.use(express.static('./template'));


app.get('/', async(req, res)=>{
    try {
        const params ={TableName:tableName}
        const data = await dymamodb.scan(params).promise();
        return res.render('index.ejs', {data: data.Items})
    } catch (error) {
        return res.status('500').send("Error retrieving data from DynamoDB")
    }
})

const storage = multer.memoryStorage({
    destination(req, file, callback) {
        callback(null, '');
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        checkFileType(file, cb);
    }
});
function checkFileType(file, cb) {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);
    if (extname && mimetype) {
        return cb(null, true);
    }
    return cb('Error: Images Only!');
}

app.post('/save', upload.single('semester'), async (req, res) => {
    try {
        const name = req.body.name;
        const course_type = req.body.course_type;
        const department = req.body.department;
        const semester = req.file.originalname.split('.');
        
        const paramsS3 = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: Date.now().toString(),
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
            ACL: 'public-read'
        };

        s3.upload(paramsS3, async (err, data) => {
            if (err) {
                console.error('Error uploading image to S3', err);
                return res.status(500).send('Error uploading image to S3');
            } else {
                const imageURL = data.Location;
                const paramsDynamoDb = {
                    TableName: tableName,
                    Item: {
                        id: Date.now().toString(),
                        name,
                        course_type,
                        semester: imageURL,
                        department
                    }
                };
                await dymamodb.put(paramsDynamoDb).promise();
                return res.redirect('/');
            }
        });
    } catch (error) {
        console.error('Error saving data to DynamoDB', error);
        return res.status(500).send('Error saving data to DynamoDB');
    }
});


app.post('/delete', upload.single(), async (req, res) => {
    try {
        const id = req.body.idd;
         if (typeof id === 'string') {
            const params = {
                TableName: tableName,
                Key: {
                    id
                }
            };
            await dymamodb.delete(params).promise();
        } else {         
            id.forEach(id => {
                const params = {
                    TableName: tableName,
                    Key: {
                        id
                    }                   
                };     
                dymamodb.delete(params).promise();           
            });            
        }
        return res.redirect('/');
    } catch (error) {
        console.error('Error deleting data from DynamoDB', error);
        return res.status(500).send('Error deleting data from DynamoDB');
    }  
});


app.use(express.json({extends:false}))
app.use(express.static('./views'))
app.listen(PORT);