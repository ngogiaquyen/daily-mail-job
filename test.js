// test-vocabulary.js
// Chạy bằng: node test-vocabulary.js

async function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 1) return [];

  // Lấy headers (loại bỏ dấu ngoặc kép thừa)
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));

  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const row = {};
    let current = "";
    let inQuote = false;
    let colIndex = 0;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];

      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === "," && !inQuote) {
        let value = current.trim().replace(/^"|"$/g, "");
        row[headers[colIndex] || `col${colIndex}`] = value;
        current = "";
        colIndex++;
      } else {
        current += char;
      }
    }
    // Thêm cột cuối cùng
    if (current !== "") {
      let value = current.trim().replace(/^"|"$/g, "");
      row[headers[colIndex] || `col${colIndex}`] = value;
    }

    data.push(row);
  }
  return data;
}

async function fetchSheet(url, sheetName) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Không thể fetch (có thể chưa publish)`);
    }
    const text = await response.text();
    const data = await parseCSV(text);

    console.log(`\n✅ Lấy thành công sheet "${sheetName}" - Có ${data.length} từ vựng`);
    console.log("Headers:", Object.keys(data[0] || {}));
    console.log("Mẫu 3 từ đầu tiên:");
    data.slice(0, 3).forEach((row, idx) => {
      console.log(`  ${idx + 1}.`, row);
    });

    // Xáo trộn và lấy 10 từ ngẫu nhiên
    const shuffled = data.sort(() => 0.5 - Math.random());
    const random10 = shuffled.slice(0, 10);

    console.log(`\n📚 10 từ ngẫu nhiên từ "${sheetName}":`);
    random10.forEach((row, idx) => {
      console.log(`  ${idx + 1}.`, row);
    });

    return random10;
  } catch (err) {
    console.error(`❌ Lỗi lấy sheet "${sheetName}":`, err.message);
    return [];
  }
}

(async () => {
  console.log("🚀 Bắt đầu test lấy từ vựng từ Google Sheets...\n");

  // === THAY ĐỔI GID ENGLISH SAU KHI BẠN PUBLISH ===
  const spreadsheetId = "1qUTZu-dOcot5QpgNtvXDyLKvPzam36snu3BtE6v5VuI";
  const chineseGid = "189761153"; // Đã hoạt động
  const englishGid = "1276717909"; // Bạn cần publish sheet english rồi lấy gid

  const chineseUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${chineseGid}`;
  const englishUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${englishGid}`;

  const chineseData = await fetchSheet(chineseUrl, "chinese");
  const englishData = await fetchSheet(englishUrl, "english");

  console.log("\n=== TỔNG KẾT ===");
  console.log(`Chinese: ${chineseData.length} từ lấy được`);
  console.log(`English: ${englishData.length} từ lấy được`);

  if (englishData.length === 0 && englishGid.includes("THAY")) {
    console.log("\n⚠️  Nhớ publish sheet 'english' rồi thay gid vào englishGid nhé!");
  }

  console.log("\n✅ Test hoàn tất!");
})();