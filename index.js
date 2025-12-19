require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

// ===== KẾT NỐI MONGODB =====
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Đã kết nối MongoDB thành công'))
  .catch(err => {
    console.error('❌ Lỗi kết nối MongoDB:', err);
    process.exit(1);
  });

// Schema cho Plan
const planSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true }, // YYYY-MM-DD
    tasks: [{
        text: String,
        completed: { type: Boolean, default: false }
    }],
    vocab: [{
        text: String,
        completed: { type: Boolean, default: false }
    }],
    meals: { type: String, default: '' },
    expenses: { type: String, default: '' },
    morningTime: { type: String, default: null }, // HH:MM hoặc null
    eveningTime: { type: String, default: null }
});

const Plan = mongoose.model('Plan', planSchema);

// ===== NODEMAILER =====
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.MAIL_FROM,
        pass: process.env.PASSWORD
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Routes trang tĩnh
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/today', '/day/:date'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'todo.html'));
});

// API: Lấy kế hoạch theo ngày
app.get('/api/plan/:date', async (req, res) => {
    try {
        let plan = await Plan.findOne({ date: req.params.date });

        if (!plan) {
            plan = {
                date: req.params.date,
                tasks: [],
                vocab: [],
                meals: '',
                expenses: '',
                morningTime: null,
                eveningTime: null
            };
        }

        res.json(plan);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// API: Tick task
app.post('/api/plan/:date/complete', async (req, res) => {
    try {
        const { taskIndex } = req.body;
        const plan = await Plan.findOne({ date: req.params.date });
        if (plan && taskIndex >= 0 && taskIndex < plan.tasks.length) {
            plan.tasks[taskIndex].completed = !plan.tasks[taskIndex].completed;
            await plan.save();
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi' });
    }
});

// API: Tick vocab
app.post('/api/plan/:date/vocab-complete', async (req, res) => {
    try {
        const { vocabIndex } = req.body;
        const plan = await Plan.findOne({ date: req.params.date });
        if (plan && vocabIndex >= 0 && vocabIndex < plan.vocab.length) {
            plan.vocab[vocabIndex].completed = !plan.vocab[vocabIndex].completed;
            await plan.save();
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi' });
    }
});

// API: Lưu kế hoạch
// API: Lưu kế hoạch - Hỗ trợ cả 2 định dạng cũ và mới để tránh lỗi
app.post('/api/plan', async (req, res) => {
    try {
        let { date, tasks = [], vocab = [], meals = '', expenses = '', morningTime, eveningTime } = req.body;

        // Chuẩn hóa tasks: nếu client gửi array string → chuyển thành object
        if (tasks.length > 0 && typeof tasks[0] === 'string') {
            tasks = tasks.map(text => ({ text: text.trim(), completed: false }));
        } else if (tasks.length > 0) {
            // Đảm bảo mỗi task là object hợp lệ
            tasks = tasks.map(task => ({
                text: typeof task === 'object' && task.text ? task.text.trim() : '',
                completed: !!task.completed
            })).filter(task => task.text);
        }

        // Chuẩn hóa vocab tương tự
        if (vocab.length > 0 && typeof vocab[0] === 'string') {
            vocab = vocab.map(text => ({ text: text.trim(), completed: false }));
        } else if (vocab.length > 0) {
            vocab = vocab.map(item => ({
                text: typeof item === 'object' && item.text ? item.text.trim() : '',
                completed: !!item.completed
            })).filter(item => item.text);
        }

        const updatedData = {
            date,
            tasks,
            vocab,
            meals: meals.trim() || '',
            expenses: expenses.trim() || '',
            morningTime: morningTime || null,
            eveningTime: eveningTime || null
        };

        console.log('Đã chuẩn hóa và lưu kế hoạch:', updatedData);

        await Plan.findOneAndUpdate(
            { date },
            updatedData,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Lỗi lưu kế hoạch:', err);
        res.status(500).json({ error: 'Lỗi lưu kế hoạch', details: err.message });
    }
});

// API: Xóa kế hoạch
app.delete('/api/plan/:date', async (req, res) => {
    try {
        await Plan.deleteOne({ date: req.params.date });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi xóa' });
    }
});

// API: Lấy tất cả các ngày có kế hoạch
app.get('/api/all-dates', async (req, res) => {
    const allPlans = await Plan.find({}, { date: 1 });
    const dates = allPlans.map(p => p.date);
    res.json(dates);
});

// ===== GỬI EMAIL BUỔI SÁNG =====
async function sendMorningEmail() {
    const today = new Date().toISOString().slice(0, 10);
    const appUrl = process.env.APP_URL || `http://localhost:${port}`;

    try {
        const plan = await Plan.findOne({ date: today }) || { tasks: [], vocab: [], meals: '', expenses: '' };
        const taskCount = plan.tasks.length;
        const vocabCount = plan.vocab.length;

        const htmlContent = `
        <h2>☀️ Chào buổi sáng! Kế hoạch hôm nay ${today}</h2>
        <p><strong>Công việc:</strong> ${taskCount} việc</p>
        <p><strong>Từ vựng:</strong> ${vocabCount} từ</p>
        <p><a href="${appUrl}/today">Mở ứng dụng để bắt đầu</a></p>
        `;

        const mailOptions = {
            from: `"Daily Planner" <${process.env.MAIL_FROM}>`,
            to: process.env.MAIL_TO,
            subject: `☀️ Kế hoạch hôm nay ${today} – Bắt đầu thôi nào!`,
            html: htmlContent
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ Email sáng gửi thành công');
    } catch (err) {
        console.error('❌ Lỗi gửi email sáng:', err);
    }
}

// ===== GỬI EMAIL BUỔI TỐI =====
async function sendEveningEmail() {
    const today = new Date().toISOString().slice(0, 10);
    const appUrl = process.env.APP_URL || `http://localhost:${port}`;

    try {
        const plan = await Plan.findOne({ date: today }) || { tasks: [], vocab: [], meals: '', expenses: '' };
        
        const completedTasks = plan.tasks.filter(t => t.completed).length;
        const taskCount = plan.tasks.length;
        const taskPercent = taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 100;

        const emoji = taskPercent >= 80 ? '🎉' : taskPercent >= 50 ? '👍' : '💪';

        const htmlContent = `
        <h2>${emoji} Tổng kết ngày ${today}</h2>
        <p>Bạn đã hoàn thành <strong>${taskPercent}%</strong> công việc (${completedTasks}/${taskCount})</p>
        <p><a href="${appUrl}/today">Xem chi tiết</a></p>
        `;

        const mailOptions = {
            from: `"Daily Planner" <${process.env.MAIL_FROM}>`,
            to: process.env.MAIL_TO,
            subject: `${emoji} Tổng kết ngày ${today} – Bạn đã làm được ${taskPercent}% kế hoạch!`,
            html: htmlContent
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ Email tối gửi thành công');
    } catch (err) {
        console.error('❌ Lỗi gửi email tối:', err);
    }
}

// ===== BIẾN THEO DÕI NGÀY ĐÃ GỬI EMAIL (reset mỗi ngày mới) =====
let lastMorningSentDate = null;
let lastEveningSentDate = null;

// ===== KIỂM TRA VÀ GỬI EMAIL MỖI PHÚT =====
async function checkAndSendEmails() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentMinute = now.toTimeString().slice(0, 5); // HH:MM

    try {
        const plan = await Plan.findOne({ date: today });

        const morningTime = plan?.morningTime || '08:00';
        const eveningTime = plan?.eveningTime || '20:00';

        // Gửi email sáng nếu đúng giờ và chưa gửi hôm nay
        if (currentMinute === morningTime && lastMorningSentDate !== today) {
            await sendMorningEmail();
            lastMorningSentDate = today;
        }

        // Gửi email tối nếu đúng giờ và chưa gửi hôm nay
        if (currentMinute === eveningTime && lastEveningSentDate !== today) {
            await sendEveningEmail();
            lastEveningSentDate = today;
        }
    } catch (err) {
        console.error('Lỗi check email:', err);
    }
}

// Chạy kiểm tra mỗi phút
setInterval(checkAndSendEmails, 60 * 1000);
checkAndSendEmails(); // Chạy ngay khi khởi động

// ===== KHỞI ĐỘNG SERVER =====
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server chạy tại http://localhost:${port}`);
    console.log(`- Trang chủ: http://localhost:${port}/`);
    console.log(`- Hôm nay: http://localhost:${port}/today`);
    console.log(`\n🔔 Email sẽ gửi theo thời gian cài đặt từng ngày (mặc định 08:00 & 20:00)`);
});