require("dotenv").config();
const nodemailer = require("nodemailer");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ===== CẤU HÌNH TỪ .ENV =====
const MORNING_TIME = process.env.MORNING_TIME || "07:30";
const TIME_TEST = process.env.TIME_TEST;
console.log("TIME_TEST:", TIME_TEST);

const LATITUDE = parseFloat(process.env.LATITUDE) || 21.5942;
const LONGITUDE = parseFloat(process.env.LONGITUDE) || 105.8482;

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const CHINESE_GID = process.env.CHINESE_GID;
const ENGLISH_GID = process.env.ENGLISH_GID;

const VISITOR_COUNTER_URL = process.env.VISITOR_COUNTER_URL;
const MARK_LEARNED_URL = process.env.MARK_LEARNED_URL;

// ===== GEMINI AI SETUP =====
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

// ===== LẤY LỜI CHÚC BUỔI SÁNG TỪ GEMINI =====
async function getAIMorningMessage(weather) {
  const prompt = `Bạn là bạn thân của Quyến, đang nhắn tin chào buổi sáng một cách tự nhiên, gần gũi như người thật nói chuyện hàng ngày.

Yêu cầu nghiêm ngặt:
- Viết bằng tiếng Việt thuần.
- Giọng thân mật, tích cực, đời thường, không sến súa, không câu khách sáo.
- Viết khoảng 2-3 câu.
- Luôn kèm theo lời chúc tốt lành, động viên tích cực.
- Không dùng bất kỳ emoji nào.
- Mỗi ngày phải diễn đạt hoàn toàn khác nhau, tránh lặp lại ý tưởng, cấu trúc câu hoặc từ ngữ đã dùng trước đó.
- Hãy sáng tạo, thay đổi cách nói mỗi lần.
- Mỗi câu phải kết thúc trọn vẹn.

Thông tin hôm nay (chỉ lồng ghép nếu thấy tự nhiên):
- Thời tiết: ${weather.description}
- Nhiệt độ hiện tại: ${weather.currentTemp}°C (cao nhất ${weather.maxTemp}°C, thấp nhất ${weather.minTemp}°C)
- Mưa: ${weather.rainInfo.toLowerCase()}

Hãy viết như một tin nhắn thật sự khác biệt so với hôm qua.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    return text || "Chào buổi sáng Quyến! Hôm nay tiếp tục bùng nổ năng lượng nào!";
  } catch (err) {
    console.error("Lỗi gọi Gemini API:", err.message || err);
    return "Sáng nay trời đẹp, dậy chưa Quyến? Cố lên nào!";
  }
}

// ===== LẤY SỐ LƯỢT TRUY CẬP WEB =====
async function getVisitorCount() {
  if (!VISITOR_COUNTER_URL) return "không rõ";
  try {
    const response = await fetch(VISITOR_COUNTER_URL);
    const data = await response.json();
    const count = data[0]?.count || 0;
    return parseInt(count);
  } catch (err) {
    console.error("Lỗi lấy lượt truy cập:", err.message);
    return "không rõ";
  }
}

// ===== LẤY 10 TỪ CHƯA HỌC TỪ 2 SHEET GOOGLE SHEETS =====
async function getRandomVocabulary() {
  if (!SPREADSHEET_ID || !CHINESE_GID || !ENGLISH_GID) {
    console.error("Thiếu cấu hình Google Sheets");
    return { chinese: [], english: [] };
  }

  const chineseUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${CHINESE_GID}`;
  const englishUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${ENGLISH_GID}`;

  const parseCSV = async (url) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Không fetch được CSV");
      const text = await response.text();
      const lines = text.trim().split("\n");
      if (lines.length < 2) return [];

      const headers = lines[0]
        .split(",")
        .map((h) => h.trim().replace(/^"|"$/g, ""));
      const data = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const row = { __rowNumber: i + 1 };
        let current = "";
        let inQuote = false;
        let colIndex = 0;

        for (let j = 0; j < line.length + 1; j++) {
          const char = j < line.length ? line[j] : ",";
          if (char === '"') inQuote = !inQuote;
          else if (char === "," && !inQuote) {
            const header = headers[colIndex] || `col${colIndex}`;
            row[header] = current.trim().replace(/^"|"$/g, "");
            current = "";
            colIndex++;
          } else {
            current += char;
          }
        }
        if (colIndex === headers.length - 1) {
          const header = headers[colIndex];
          row[header] = current.trim().replace(/^"|"$/g, "");
        }

        data.push(row);
      }
      return data;
    } catch (err) {
      console.error("Lỗi parse CSV:", err.message);
      return [];
    }
  };

  const chineseData = await parseCSV(chineseUrl);
  const englishData = await parseCSV(englishUrl);

  const learnedCol = "Learned";

  const chineseUnlearned = chineseData.filter((row) => {
    const val = (row[learnedCol] || "").trim().toUpperCase();
    return val !== "TRUE";
  });

  const englishUnlearned = englishData.filter((row) => {
    const val = (row[learnedCol] || "").trim().toUpperCase();
    return val !== "TRUE";
  });

  const shuffle = (arr) => arr.sort(() => 0.5 - Math.random());

  const chineseRandom = shuffle(chineseUnlearned).slice(0, 10);
  const englishRandom = shuffle(englishUnlearned).slice(0, 10);

  console.log(`Tìm thấy ${chineseUnlearned.length} từ Hán ngữ chưa học → gửi ${chineseRandom.length}`);
  console.log(`Tìm thấy ${englishUnlearned.length} từ tiếng Anh chưa học → gửi ${englishRandom.length}`);

  return { chinese: chineseRandom, english: englishRandom };
}

// ===== LẤY THỜI TIẾT =====
async function getWeatherInfo() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=Asia/Bangkok&forecast_days=1`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("API lỗi");
    const data = await response.json();

    if (!data.current || !data.daily) throw new Error("Dữ liệu không đầy đủ");

    const currentTemp = Math.round(data.current.temperature_2m);
    const maxTemp = Math.round(data.daily.temperature_2m_max[0]);
    const minTemp = Math.round(data.daily.temperature_2m_min[0]);
    const precipitation = data.daily.precipitation_sum[0] || 0;

    const code = data.current.weather_code;
    let description = "Thời tiết đẹp";
    if ([0].includes(code)) description = "Trời quang đãng";
    else if ([1, 2, 3].includes(code)) description = "Nhiều mây";
    else if ([45, 48].includes(code)) description = "Sương mù";
    else if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
      description = "Có mưa";
    else if ([71, 73, 75, 77, 85, 86].includes(code)) description = "Tuyết rơi";
    else if ([95, 96, 99].includes(code)) description = "Dông bão";

    const rainInfo = precipitation > 0 ? `${precipitation} mm mưa` : "Không mưa";

    return { currentTemp, maxTemp, minTemp, description, rainInfo };
  } catch (err) {
    console.error("Lỗi lấy thời tiết:", err.message);
    return {
      currentTemp: "?",
      maxTemp: "?",
      minTemp: "?",
      description: "Không lấy được",
      rainInfo: "?",
    };
  }
}

// ===== EMOJI THỜI TIẾT =====
function getWeatherEmoji(description) {
  if (description.includes("quang đãng") || description.includes("đẹp")) return "☀️";
  if (description.includes("mây")) return "☁️";
  if (description.includes("mưa")) return "🌧️";
  if (description.includes("mù")) return "🌫️";
  if (description.includes("tuyết")) return "❄️";
  if (description.includes("dông") || description.includes("bão")) return "⛈️";
  return "🌤️";
}

// ===== ĐỊNH DẠNG NGÀY & GIỜ VIỆT NAM =====
function formatDateDDMMYYYY(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function getVietnamTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
}

// ===== NODEMAILER =====
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_FROM,
    pass: process.env.PASSWORD,
  },
});

let lastMorningSentDate = null;

// ===== GỬI EMAIL BUỔI SÁNG =====
async function sendMorningEmail() {
  const vietnamNow = getVietnamTime();
  const formattedDate = formatDateDDMMYYYY(vietnamNow);

  const weather = await getWeatherInfo();
  const visitorCount = await getVisitorCount();
  const aiMessage = await getAIMorningMessage(weather);
  const weatherEmoji = getWeatherEmoji(weather.description);

  const { chinese, english } = await getRandomVocabulary();

  const preheaderText = aiMessage.replace(/\n/g, " ");
  const preheaderHTML = `<div style="display:none; font-size:0; max-height:0; line-height:0; mso-hide:all; overflow:hidden;">${preheaderText}</div>`;

  const visitorDisplay =
    typeof visitorCount === "number"
      ? `${visitorCount.toLocaleString("vi-VN")} lượt truy cập`
      : visitorCount;

  let vocabularyHTML = "";

  if (chinese.length === 0 && english.length === 0) {
    vocabularyHTML = `<p style="font-style:italic; color:#64748b; text-align:center;">Hôm nay bạn đã ôn hết từ rồi! Nghỉ ngơi chút đi nào 😊</p>`;
  }

  // Bảng Chinese
  if (chinese.length > 0) {
    vocabularyHTML += `
  <h2 style="margin-top:32px; font-size:20px;">Ôn từ Hán ngữ hôm nay (${chinese.length} từ mới)</h2>
  <table style="width:100%; border-collapse:collapse; background:#f0fdf4; border-radius:12px; overflow:hidden; margin-bottom:30px;">
    <thead>
      <tr style="background:#22c55e; color:white;">
        <th style="padding:12px; text-align:center;">Hán tự</th>
        <th style="padding:12px; text-align:center;">Pinyin</th>
        <th style="padding:12px; text-align:center;">Nghĩa</th>
        <th style="padding:12px; text-align:center;">Loại từ</th>
        <th style="padding:12px; text-align:center;">Ví dụ</th>
        <th style="padding:12px; text-align:center;">Nghe</th>
        <th style="padding:12px; text-align:center;">Đánh dấu</th>
      </tr>
    </thead>
    <tbody>`;

    chinese.forEach((card) => {
      const hanTu = card["Từ Gốc (Chinese Character)"] || "";
      const googleTranslateUrl = `https://translate.google.com/?sl=zh-CN&tl=vi&text=${encodeURIComponent(hanTu)}&op=translate`;
      const rowNumber = card.__rowNumber;
      const markUrl = `${MARK_LEARNED_URL}?sheet=Chinese&row=${rowNumber}`;

      vocabularyHTML += `
      <tr style="border-bottom:1px solid #bbf7d0;">
        <td style="padding:14px; text-align:center; font-size:20px; font-weight:bold;">${hanTu}</td>
        <td style="padding:14px; text-align:center; font-style:italic; color:#16a34a;">${card["Phiên Âm (Pinyin)"] || ""}</td>
        <td style="padding:14px; text-align:center;">${card["Nghĩa Tiếng Việt (Vietnamese Meaning)"] || ""}</td>
        <td style="padding:14px; text-align:center;">${card["Loại Từ (Part of Speech)"] || ""}</td>
        <td style="padding:14px; text-align:center; font-size:14px;">${card["Câu Ví Dụ (Example Sentence)"] || ""}</td>
        <td style="padding:14px; text-align:center;">
          <a href="${googleTranslateUrl}" target="_blank" style="display:inline-block; padding:9px 14px; background:#1e88e5; color:white; text-decoration:none; border-radius:8px; font-weight:600;">
            🔊 Nghe
          </a>
        </td>
        <td style="padding:14px; text-align:center;">
          <a href="${markUrl}" target="_blank" style="display:inline-block; padding:9px 14px; background:#10b981; color:white; text-decoration:none; border-radius:8px; font-weight:600;">
            ✅ Đã học
          </a>
        </td>
      </tr>`;
    });

    vocabularyHTML += `</tbody></table>`;
  }

  // Bảng English
  if (english.length > 0) {
    vocabularyHTML += `
  <h2 style="margin-top:0; font-size:20px;">Ôn từ tiếng Anh hôm nay (${english.length} từ mới)</h2>
  <table style="width:100%; border-collapse:collapse; background:#fefce8; border-radius:12px; overflow:hidden; margin-bottom:20px;">
    <thead>
      <tr style="background:#f59e0b; color:white;">
        <th style="padding:12px; text-align:center;">Word</th>
        <th style="padding:12px; text-align:center;">Pronunciation</th>
        <th style="padding:12px; text-align:center;">Meaning</th>
        <th style="padding:12px; text-align:center;">Part of Speech</th>
        <th style="padding:12px; text-align:center;">Example</th>
        <th style="padding:12px; text-align:center;">Nghe</th>
        <th style="padding:12px; text-align:center;">Đánh dấu</th>
      </tr>
    </thead>
    <tbody>`;

    english.forEach((card) => {
      const word = card["Từ Gốc (Original Word)"] || "";
      const googleTranslateUrl = `https://translate.google.com/?sl=en&tl=vi&text=${encodeURIComponent(word)}&op=translate`;
      const rowNumber = card.__rowNumber;
      const markUrl = `${MARK_LEARNED_URL}?sheet=English&row=${rowNumber}`;

      vocabularyHTML += `
      <tr style="border-bottom:1px solid #fde68a;">
        <td style="padding:14px; text-align:center; font-weight:bold;">${word}</td>
        <td style="padding:14px; text-align:center; font-style:italic; color:#b45309;">${card["Phiên Âm (IPA)"] || ""}</td>
        <td style="padding:14px; text-align:center;">${card["Nghĩa Tiếng Việt (Vietnamese Meaning)"] || ""}</td>
        <td style="padding:14px; text-align:center;">${card["Loại Từ (Part of Speech)"] || ""}</td>
        <td style="padding:14px; text-align:center; font-size:14px;">${card["Câu Ví Dụ (Example Sentence)"] || ""}</td>
        <td style="padding:14px; text-align:center;">
          <a href="${googleTranslateUrl}" target="_blank" style="display:inline-block; padding:9px 14px; background:#1e88e5; color:white; text-decoration:none; border-radius:8px; font-weight:600;">
            🔊 Nghe
          </a>
        </td>
        <td style="padding:14px; text-align:center;">
          <a href="${markUrl}" target="_blank" style="display:inline-block; padding:9px 14px; background:#10b981; color:white; text-decoration:none; border-radius:8px; font-weight:600;">
            ✅ Đã học
          </a>
        </td>
      </tr>`;
    });

    vocabularyHTML += `</tbody></table>`;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chào buổi sáng Quyến!</title>
        <style>
            body { margin:0; padding:16px 0; background:#f8fafc; font-family:system-ui,-apple-system,sans-serif; }
            .container { max-width:600px; margin:0 auto; }
            .card { background:#fff; border-radius:20px; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,0.08); }
            .content { padding:32px 12px; color:#1e293b; }
            .ai-message { font-size:16px; line-height:1.6; text-align:left; background:#f0f9ff; padding:16px; border-radius:8px; margin-bottom:32px; border-left:5px solid #0ea5e9; }
            .weather-table, .visitor-box { width:100%; background:#f1f5f9; border-radius:12px; overflow:hidden; margin-bottom:20px; }
            .weather-table td, .visitor-box td { padding:14px 16px; font-size:16px; }
            .weather-table strong, .visitor-box strong { color:#475569; }
            .weather-table .value, .visitor-box .value { text-align:right; font-weight:600; color:#1e293b; }
            .visitor-box { background:#fefce8; }
            .visitor-box .value { font-size:20px; color:#d97706; }
            .footer { text-align:center; color:#64748b; font-size:13px; margin-top:32px; }
        </style>
    </head>
    <body>
        ${preheaderHTML}
        <div class="container">
            <div class="card">
                <div class="content">
                    <div class="ai-message">
                        ${aiMessage.replace(/\n/g, "<br>")}
                    </div>

                    <h2 style="margin-top:0; font-size:20px;">Thời tiết hôm nay • ${formattedDate}</h2>
                    <table class="weather-table" cellpadding="0" cellspacing="0">
                        <tr><td><strong>Nhiệt độ hiện tại</strong></td><td class="value">${weather.currentTemp}°C</td></tr>
                        <tr><td><strong>Cao nhất / Thấp nhất</strong></td><td class="value">${weather.maxTemp}°C / ${weather.minTemp}°C</td></tr>
                        <tr><td><strong>Trạng thái</strong></td><td class="value">${weather.description}</td></tr>
                        <tr><td><strong>Mưa</strong></td><td class="value">${weather.rainInfo}</td></tr>
                    </table>

                    <h2 style="margin-top:32px; font-size:20px;">Website của bạn</h2>
                    <table class="visitor-box" cellpadding="0" cellspacing="0">
                        <tr><td><strong>Tổng lượt truy cập</strong></td><td class="value">${visitorDisplay}</td></tr>
                    </table>

                    ${vocabularyHTML}
                </div>
                <div class="footer">
                    Email tự động từ script ❤️ • Thái Nguyên • ngoquyen.io.vn
                </div>
            </div>
        </div>
    </body>
    </html>`;

  const mailOptions = {
    from: `"Quyến ơi!" <${process.env.MAIL_FROM}>`,
    to: process.env.MAIL_TO,
    subject: `${weatherEmoji} ${weather.description}, ${weather.currentTemp}°C`,
    html: htmlContent,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("✅ Email buổi sáng đã gửi thành công!");
  } catch (err) {
    console.error("❌ Lỗi gửi email:", err);
  }
}

// ===== CHECK VÀ GỬI EMAIL =====
function checkAndSendEmail() {
  const vietnamNow = getVietnamTime();
  const todayKey = vietnamNow.toISOString().slice(0, 10);
  const currentTime = vietnamNow.toTimeString().slice(0, 5);

  console.log(`⏰ Giờ Việt Nam: ${vietnamNow.toLocaleString("vi-VN")} - ${currentTime}`);

  if (
    (currentTime === MORNING_TIME || (TIME_TEST && currentTime === TIME_TEST)) &&
    lastMorningSentDate !== todayKey
  ) {
    console.log(`🔔 Đúng giờ gửi (${currentTime}) - Đang gửi email...`);
    sendMorningEmail();
    lastMorningSentDate = todayKey;
  }
}

// Chạy ngay nếu có TIME_TEST
if (TIME_TEST) {
  console.log(`🧪 Chế độ TEST: Gửi ngay lúc ${TIME_TEST}`);
  sendMorningEmail();
}

// Kiểm tra mỗi phút
setInterval(checkAndSendEmail, 60 * 1000);
checkAndSendEmail();

console.log("🚀 Script gửi email buổi sáng + từ vựng CHƯA HỌC đang chạy...");
console.log(`🔔 Gửi hàng ngày lúc: ${MORNING_TIME} (giờ Việt Nam)`);
if (TIME_TEST) console.log(`🧪 TEST lúc: ${TIME_TEST}`);