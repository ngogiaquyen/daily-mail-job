require('dotenv').config();
const nodemailer = require('nodemailer');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ===== CẤU HÌNH =====
const MORNING_TIME = '09:21';
const TIME_TEST = process.env.TIME_TEST || '09:21';  // Giờ gửi email hàng ngày (giờ Việt Nam)
console.log("time test", process.env.TIME_TEST);

const LATITUDE = 21.5942;
const LONGITUDE = 105.8482;

// ===== GEMINI AI SETUP =====
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ===== LẤY LỜI CHÚC BUỔI SÁNG TỪ GEMINI =====
async function getAIMorningMessage(weather) {
    const prompt = `Viết một lời chúc buổi sáng ngắn gọn (2-3 câu), tích cực, truyền năng lượng bằng tiếng Việt, dành cho người trẻ ở, tôi tên Quyến.
Thời tiết hôm nay: ${weather.description}, nhiệt độ hiện tại ${weather.currentTemp}°C, cao nhất ${weather.maxTemp}°C, thấp nhất ${weather.minTemp}°C, ${weather.rainInfo.toLowerCase()}.
Lời chúc phải tự nhiên, gần gũi, không sến, phù hợp để hiển thị ngay trong thông báo điện thoại.`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();
        return text || 'Chúc bạn một buổi sáng thật tuyệt vời và tràn đầy năng lượng!';
    } catch (err) {
        console.error('❌ Lỗi gọi Gemini API:', err.message || err);
        return 'Chúc bạn một buổi sáng thật tuyệt vời và tràn đầy năng lượng!';
    }
}

// ===== NODEMAILER SETUP =====
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.MAIL_FROM,
        pass: process.env.PASSWORD  // App Password của Google
    }
});

// Tránh gửi trùng trong ngày
let lastMorningSentDate = null;

// ===== LẤY THỜI TIẾT TỪ OPEN-METEO =====
async function getWeatherInfo() {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=Asia%2FBangkok&forecast_days=1`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        const currentTemp = Math.round(data.current.temperature_2m);
        const maxTemp = Math.round(data.daily.temperature_2m_max[0]);
        const minTemp = Math.round(data.daily.temperature_2m_min[0]);
        const precipitation = data.daily.precipitation_sum[0];

        const code = data.current.weather_code;
        let description = 'Thời tiết đẹp';
        if ([0].includes(code)) description = 'Trời quang đãng';
        else if ([1, 2, 3].includes(code)) description = 'Nhiều mây';
        else if ([45, 48].includes(code)) description = 'Sương mù';
        else if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) description = 'Có mưa';
        else if ([71, 73, 75, 77, 85, 86].includes(code)) description = 'Tuyết rơi';
        else if ([95, 96, 99].includes(code)) description = 'Dông bão';

        const rainInfo = precipitation > 0 ? `${precipitation} mm mưa` : 'Không mưa';

        return { currentTemp, maxTemp, minTemp, description, rainInfo };
    } catch (err) {
        console.error('❌ Lỗi lấy dữ liệu thời tiết:', err);
        return {
            currentTemp: '?',
            maxTemp: '?',
            minTemp: '?',
            description: 'Không lấy được',
            rainInfo: '?'
        };
    }
}

// ===== CHỌN EMOJI THỜI TIẾT =====
function getWeatherEmoji(description, rainInfo) {
    if (description.includes('quang đãng') || description.includes('đẹp')) return '☀️';
    if (description.includes('mây')) return '☁️';
    if (description.includes('mưa')) return '🌧️';
    if (description.includes('mù')) return '🌫️';
    if (description.includes('tuyết')) return '❄️';
    if (description.includes('dông') || description.includes('bão')) return '⛈️';
    return '🌤️'; // default
}

// ===== ĐỊNH DẠNG NGÀY =====
function formatDateDDMMYYYY(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// ===== HÀM CHUYỂN ĐỔI THỜI GIAN VỀ GIỜ VIỆT NAM (UTC+7) =====
function getVietnamTime() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
}

// ===== GỬI EMAIL BUỔI SÁNG =====
async function sendMorningEmail() {
    const vietnamNow = getVietnamTime(); // Dùng giờ Việt Nam để hiển thị ngày
    const formattedDate = formatDateDDMMYYYY(vietnamNow);
    const appUrl = process.env.APP_URL || 'https://your-app.com';

    const weather = await getWeatherInfo();
    const aiMessage = await getAIMorningMessage(weather);
    const weatherEmoji = getWeatherEmoji(weather.description, weather.rainInfo);

    // Preheader: phần này sẽ hiển thị ở dòng preview thông báo trên điện thoại
    const preheaderText = `${aiMessage.replace(/\n/g, ' ')} • Nhiệt độ: ${weather.currentTemp}°C (↑${weather.maxTemp}°C ↓${weather.minTemp}°C) • ${weather.description} ${weather.rainInfo.includes('mm') ? '🌧️' : ''}`;

    const preheaderHTML = `
    <div style="display:none; font-size:0; max-height:0; line-height:0; mso-hide:all; overflow:hidden;">
        ${preheaderText}
    </div>`;

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chào buổi sáng</title>
        <style>
            body { margin:0; padding:16px 0; background:#f8fafc; font-family:system-ui,-apple-system,sans-serif; }
            .container { max-width:600px; margin:0 auto; }
            .card { background:#fff; border-radius:20px; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,0.08); }
            .header { background:linear-gradient(135deg,#4299e1,#3182ce); color:white; padding:32px 24px; text-align:center; }
            .header h1 { font-size:26px; margin:0; font-weight:700; }
            .header p { font-size:17px; margin:8px 0 0; opacity:0.95; }
            .content { padding:32px 24px; color:#1e293b; }
            .content h2 { font-size:20px; margin:0 0 20px; font-weight:600; }
            .weather-table { width:100%; background:#f1f5f9; border-radius:12px; overflow:hidden; }
            .weather-table td { padding:12px 16px; font-size:16px; }
            .weather-table strong { color:#475569; }
            .weather-table .value { text-align:right; font-weight:600; color:#1e293b; }
            .ai-message { font-size:17px; margin:28px 0; line-height:1.6; font-style:italic; color:#475569; text-align:center; background:#f8fafc; padding:20px; border-radius:12px; }
            .btn { display:inline-block; margin:32px 0 0; padding:14px 32px; background:linear-gradient(135deg,#4299e1,#3182ce); color:white; font-size:17px; font-weight:600; text-decoration:none; border-radius:12px; box-shadow:0 8px 16px rgba(66,153,225,0.3); }
            .footer { text-align:center; color:#64748b; font-size:13px; margin-top:24px; }
        </style>
    </head>
    <body>
        ${preheaderHTML}
        <div class="container">
            <div class="card">
                <div class="content">
                    <h2>Thời tiết hôm nay, ${formattedDate} tại Thái Nguyên</h2>
                    <table class="weather-table" cellpadding="0" cellspacing="0">
                        <tr><td><strong>Nhiệt độ hiện tại:</strong></td><td class="value">${weather.currentTemp}°C</td></tr>
                        <tr><td><strong>Cao nhất / Thấp nhất:</strong></td><td class="value">${weather.maxTemp}°C / ${weather.minTemp}°C</td></tr>
                        <tr><td><strong>Trạng thái:</strong></td><td class="value">${weather.description}</td></tr>
                        <tr><td><strong>Mưa:</strong></td><td class="value">${weather.rainInfo}</td></tr>
                    </table>

                    <div style="text-align:center;">
                        <a href="${appUrl}/today" class="btn">Mở ứng dụng để bắt đầu ngày mới</a>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;

    const mailOptions = {
        from: `"Quyến ơi!!" <${process.env.MAIL_FROM}>`,
        to: process.env.MAIL_TO,
        subject: `${weatherEmoji} ${weather.description}, ${weather.currentTemp}°C tại Thái Nguyên hôm nay`,
        html: htmlContent
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('✅ Email sáng đã gửi thành công! Thông báo trên điện thoại sẽ hiển thị đẹp.');
    } catch (err) {
        console.error('❌ Lỗi gửi email:', err);
    }
}

// ===== KIỂM TRA VÀ GỬI MỖI PHÚT =====
function checkAndSendEmail() {
    const vietnamNow = getVietnamTime(); // Dùng giờ Việt Nam để kiểm tra

    const todayKey = vietnamNow.toISOString().slice(0, 10); // Ngày theo giờ VN
    const currentTime = vietnamNow.toTimeString().slice(0, 5); // HH:MM theo giờ VN

    console.log(`⏰ Giờ Việt Nam hiện tại: ${vietnamNow.toLocaleString('vi-VN')} - ${currentTime}`);

    if (currentTime === MORNING_TIME && lastMorningSentDate !== todayKey) {
        console.log(`🔔 Đúng ${MORNING_TIME} giờ Việt Nam - Đang gửi email...`);
        sendMorningEmail();
        lastMorningSentDate = todayKey;
    }
    
    if (currentTime === TIME_TEST && lastMorningSentDate !== todayKey) {
        console.log(`🔔 TEST ${TIME_TEST} giờ Việt Nam - Đang gửi email...`);
        sendMorningEmail();
        lastMorningSentDate = todayKey;
    }
}

setInterval(checkAndSendEmail, 60 * 1000);
checkAndSendEmail();

console.log('🚀 Script gửi email buổi sáng đang chạy...');
console.log(`🔔 Email sẽ được gửi lúc: ${MORNING_TIME} hàng ngày (giờ Việt Nam)`);