require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const cron = require('node-cron');

const app = express();
const port = process.env.PORT || 3000;

// ===== LOWDB SETUP – ĐÃ FIX LỖI "missing default data" =====
const adapter = new JSONFile('db.json');
const defaultData = { plans: [] };
const db = new Low(adapter, defaultData);

async function initDb() {
    await db.read();
    await db.write(); // Tạo file db.json nếu chưa tồn tại
}
// =========================================================

// Nodemailer
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

// API: Lấy kế hoạch
app.get('/api/plan/:date', async (req, res) => {
    await db.read();
    const plan = db.data.plans.find(p => p.date === req.params.date) || {
        date: req.params.date,
        tasks: [],
        vocab: [],
        meals: '',
        expenses: ''
    };

    const normalizedTasks = (plan.tasks || []).map(t =>
        typeof t === 'string' ? { text: t, completed: false } : t
    );

    let normalizedVocab = [];
    if (typeof plan.vocab === 'string' && plan.vocab.trim()) {
        normalizedVocab = plan.vocab.split('\n')
            .filter(l => l.trim())
            .map(l => ({ text: l.trim(), completed: false }));
    } else if (Array.isArray(plan.vocab)) {
        normalizedVocab = plan.vocab.map(v =>
            typeof v === 'string' ? { text: v, completed: false } : v
        );
    }

    res.json({
        date: req.params.date,
        tasks: normalizedTasks,
        vocab: normalizedVocab,
        meals: plan.meals || '',
        expenses: plan.expenses || ''
    });
});

// API: Tick task
app.post('/api/plan/:date/complete', async (req, res) => {
    await db.read();
    const { taskIndex } = req.body;
    const plan = db.data.plans.find(p => p.date === req.params.date);
    if (plan && taskIndex >= 0 && taskIndex < plan.tasks.length) {
        plan.tasks[taskIndex].completed = !plan.tasks[taskIndex].completed;
        await db.write();
    }
    res.json({ success: true });
});

// API: Tick vocab
app.post('/api/plan/:date/vocab-complete', async (req, res) => {
    await db.read();
    const { vocabIndex } = req.body;
    const plan = db.data.plans.find(p => p.date === req.params.date);
    if (plan && vocabIndex >= 0 && vocabIndex < plan.vocab.length) {
        plan.vocab[vocabIndex].completed = !plan.vocab[vocabIndex].completed;
        await db.write();
    }
    res.json({ success: true });
});

// API: Lưu kế hoạch (từ trang lập kế hoạch)
app.post('/api/plan', async (req, res) => {
    await db.read();

    const { date, tasks, vocab, meals, expenses } = req.body;

    const normalizedTasks = (Array.isArray(tasks) ? tasks : [])
        .filter(t => t && t.trim())
        .map(t => ({ text: t.trim(), completed: false }));

    const vocabArray = typeof vocab === 'string'
        ? vocab.split('\n')
            .filter(l => l.trim())
            .map(l => ({ text: l.trim(), completed: false }))
        : [];

    const newPlan = {
        date,
        tasks: normalizedTasks,
        vocab: vocabArray,
        meals: meals?.trim() || '',
        expenses: expenses?.trim() || ''
    };
    console.log('Received new plan:', newPlan);

    const index = db.data.plans.findIndex(p => p.date === date);
    if (index !== -1) {
        db.data.plans[index] = newPlan;
    } else {
        db.data.plans.push(newPlan);
    }

    await db.write();

    res.json({ success: true });
});

// API: Xóa
app.delete('/api/plan/:date', async (req, res) => {
    await db.read();
    db.data.plans = db.data.plans.filter(p => p.date !== req.params.date);
    await db.write();
    res.json({ success: true });
});

// ===== GỬI EMAIL ĐẦU NGÀY (8h sáng) =====
function sendMorningEmail() {
    const today = new Date().toISOString().slice(0, 10);
    const appUrl = process.env.APP_URL || `http://localhost:${port}`;

    db.read().then(() => {
        const plan = db.data.plans.find(p => p.date === today) || { tasks: [], vocab: [], meals: '', expenses: '' };
        const taskCount = plan.tasks.length || 0;
        const vocabCount = plan.vocab.length || 0;

        const htmlContent = `
            <html><head><style>
                body { font-family: system-ui, sans-serif; background: #f0fdf4; padding: 20px; }
                .container { max-width: 600px; margin: auto; background: white; border-radius: 16px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); text-align: center; }
                h2 { color: #16a34a; font-size: 28px; }
                .btn { display: inline-block; margin: 30px 0; padding: 16px 32px; background: #16a34a; color: white; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 18px; }
                .summary { background: #ecfdf5; padding: 20px; border-radius: 12px; margin: 20px 0; font-size: 18px; }
            </style></head><body>
                <div class="container">
                    <h2>☀️ Chào buổi sáng! Kế hoạch hôm nay ${today}</h2>
                    <div class="summary">
                        <strong>${taskCount} công việc</strong> đang chờ bạn<br>
                        <strong>${vocabCount} từ vựng mới</strong> cần học
                    </div>
                    <p>Hãy bắt đầu ngày mới thật năng lượng nhé!</p>
                    <a href="${appUrl}/day/${today}" class="btn">Xem & Tick Kế Hoạch Ngay →</a>
                    <hr style="margin:40px 0;border:none;border-top:1px solid #eee;">
                    <small>Ăn uống dự kiến: ${plan.meals || 'Chưa ghi'} | Chi tiêu: ${plan.expenses || '0 VNĐ'}</small>
                </div>
            </body></html>
        `;

        const mailOptions = {
            from: `"Daily Planner" <${process.env.MAIL_FROM}>`,
            to: process.env.MAIL_TO,
            subject: `☀️ Kế hoạch hôm nay ${today} – Bắt đầu thôi nào!`,
            html: htmlContent
        };

        transporter.sendMail(mailOptions, (err, info) => {
            err ? console.error('Lỗi email sáng:', err) : console.log('Email sáng gửi thành công:', info.response);
        });
    });
}

// ===== GỬI EMAIL CUỐI NGÀY (20h tối) =====
function sendEveningEmail() {
    const today = new Date().toISOString().slice(0, 10);
    const appUrl = process.env.APP_URL || `http://localhost:${port}`;

    db.read().then(() => {
        const plan = db.data.plans.find(p => p.date === today) || { tasks: [], vocab: [], meals: '', expenses: '' };
        
        const completedTasks = plan.tasks.filter(t => t.completed).length;
        const taskCount = plan.tasks.length;
        const taskPercent = taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 100;

        const completedVocab = plan.vocab.filter(v => v.completed).length;
        const vocabCount = plan.vocab.length;
        const vocabPercent = vocabCount > 0 ? Math.round((completedVocab / vocabCount) * 100) : 100;

        const emoji = taskPercent >= 80 ? '🎉' : taskPercent >= 50 ? '👍' : '💪';

        const htmlContent = `
            <html><head><style>
                body { font-family: system-ui, sans-serif; background: #fff7ed; padding: 20px; }
                .container { max-width: 600px; margin: auto; background: white; border-radius: 16px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); text-align: center; }
                h2 { color: #f97316; font-size: 28px; }
                .btn { display: inline-block; margin: 30px 0; padding: 16px 32px; background: #f97316; color: white; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 18px; }
                .summary { background: #fff4e6; padding: 25px; border-radius: 12px; margin: 20px 0; font-size: 18px; }
                .progress { font-size: 36px; font-weight: bold; color: #f97316; margin: 20px 0; }
            </style></head><body>
                <div class="container">
                    <h2>${emoji} Tóm tắt ngày hôm nay – ${today}</h2>
                    <div class="progress">${taskPercent}%</div>
                    <div class="summary">
                        <strong>${completedTasks}/${taskCount}</strong> công việc hoàn thành<br>
                        <strong>${completedVocab}/${vocabCount}</strong> từ vựng đã học<br><br>
                        Chi tiêu: ${plan.expenses || '0 VNĐ'}<br>
                        Ăn uống: ${plan.meals || 'Chưa ghi'}
                    </div>
                    <p>Bạn đã làm rất tốt hôm nay! ${taskPercent >= 80 ? 'Xuất sắc!' : 'Cố lên ngày mai nhé!'}</p>
                    <a href="${appUrl}/day/${today}" class="btn">Xem Chi Tiết & Tick Thêm →</a>
                    <hr style="margin:40px 0;border:none;border-top:1px solid #eee;">
                    <small>Nghỉ ngơi thật tốt để ngày mai tiếp tục bùng nổ nhé! 🌙</small>
                </div>
            </body></html>
        `;

        const mailOptions = {
            from: `"Daily Planner" <${process.env.MAIL_FROM}>`,
            to: process.env.MAIL_TO,
            subject: `${emoji} Tổng kết ngày ${today} – Bạn đã làm được ${taskPercent}% kế hoạch!`,
            html: htmlContent
        };

        transporter.sendMail(mailOptions, (err, info) => {
            err ? console.error('Lỗi email tối:', err) : console.log('Email tối gửi thành công:', info.response);
        });
    });
}

// ===== LÊN LỊCH 2 EMAIL MỖI NGÀY =====
cron.schedule('0 8 * * *', sendMorningEmail);   // 8h sáng
cron.schedule('20 16 * * *', sendEveningEmail);  // 20h tối

console.log('Đã lên lịch:');
console.log('  ☀️ Email chào buổi sáng: 8:00 hàng ngày');
console.log('  🌙 Email tổng kết cuối ngày: 20:00 hàng ngày');

// Khởi động
async function startServer() {
    await initDb();
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server chạy tại http://localhost:${port}`);
        console.log(`- Lập kế hoạch: http://localhost:${port}/`);
        console.log(`- Tick hôm nay: http://localhost:${port}/today`);
    });
}

startServer();