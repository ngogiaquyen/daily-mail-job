const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Cấu hình middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Cấu hình Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.MAIL_FROM, // Thay bằng email của bạn
        pass: process.env.PASSWORD // Thay bằng mật khẩu ứng dụng của Gmail
    }
});

// Route để hiển thị form đánh giá
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route xử lý form đánh giá
app.post('/submit-review', (req, res) => {
    const { rating, comment } = req.body;
    // Tạo nội dung HTML cho email
    const htmlContent = `
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                h2 { color: #4CAF50; text-align: center; }
                .rating { font-size: 24px; color: #f1c40f; text-align: center; }
                .comment { margin-top: 20px; padding: 10px; background-color: #f9f9f9; border-left: 4px solid #4CAF50; }
                p { margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>Đánh giá dịch vụ mới</h2>
                <p><strong>Điểm đánh giá:</strong> ${rating} sao</p>
                <div class="rating">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</div>
                <div class="comment">
                    <p><strong>Nhận xét:</strong></p>
                    <p>${comment}</p>
                </div>
            </div>
        </body>
        </html>
    `;

    // Cấu hình email
    const mailOptions = {
        from: process.env.MAIL_FROM, // Thay bằng email của bạn
        to: process.env.MAIL_TO, // Email nhận đánh giá
        subject: 'Đánh giá dịch vụ mới',
        html: htmlContent
    };

    // Gửi email
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error(error);
            res.send('Có lỗi xảy ra khi gửi đánh giá. Vui lòng thử lại.');
        } else {
            console.log('Email sent: ' + info.response);
            res.send('Cảm ơn bạn đã gửi đánh giá!');
        }
    });
});

// Khởi động server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});