// database.js - Настройка и инициализация базы данных
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Создаем директорию для базы данных, если её нет
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

// Инициализация базы данных
const db = new sqlite3.Database(path.join(dbDir, 'kit_admissions.db'));

// Функция инициализации базы данных
function initDatabase() {
  return new Promise((resolve, reject) => {
    // Выполняем последовательно все запросы на создание таблиц
    db.serialize(() => {
      // Создаем таблицу специальностей
      
      
      db.run(`CREATE TABLE IF NOT EXISTS specialties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        duration TEXT NOT NULL, 
        qualification TEXT NOT NULL,
        description TEXT NOT NULL,
        advantages TEXT NOT NULL,
        image_url TEXT,
        plan_url TEXT
      )`);

      // Создаем таблицу документов
      db.run(`CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        file_url TEXT,
        category TEXT NOT NULL
      )`);

      // Создаем таблицу абитуриентов
      db.run(`CREATE TABLE IF NOT EXISTS applicants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        specialty_id INTEGER NOT NULL,
        points REAL NOT NULL,
        status TEXT DEFAULT 'Ожидание',
        FOREIGN KEY(specialty_id) REFERENCES specialties(id)
      )`);

      // Создаем таблицу лимитов бюджетных мест
      db.run(`CREATE TABLE IF NOT EXISTS budget_limits (
        specialty_id INTEGER PRIMARY KEY,
        budget_limit INTEGER NOT NULL,
        FOREIGN KEY(specialty_id) REFERENCES specialties(id)
      )`);

      // Создаем таблицу настроек
      db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`);

      // Создаем таблицу для галереи "Как устроена работа в КИТ"
      db.run(`CREATE TABLE IF NOT EXISTS gallery (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        image_url TEXT NOT NULL,
        type TEXT DEFAULT 'image'
      )`);
        // Создаем таблицу заявок
      db.run(`CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        specialty_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        status TEXT DEFAULT 'На рассмотрении',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(specialty_id) REFERENCES specialties(id)
      )`);
      // Проверяем, есть ли данные в таблице specialties
      db.get(`SELECT COUNT(*) as count FROM specialties`, [], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        // Если данных нет, добавляем начальные данные
        if (row.count === 0) {
          insertInitialData()
            .then(resolve)
            .catch(reject);
        } else {
          resolve();
        }
        
      });
    });
  });
}

// Функция добавления начальных данных
function insertInitialData() {
  return new Promise((resolve, reject) => {
    // Добавляем специальности
    const specialties = [
      {
        code: '09.02.06',
        name: 'Сетевое и системное администрирование',
        duration: '3 года 10 месяцев',
        qualification: 'Сетевой и системный администратор; специалист по администрированию сети',
        description: 'Сетевой и системный администратор; специалист по администрированию сети занимается проектированием локальной сети, установкой и настройкой сетевых протоколов и сетевого оборудования, обеспечением безопасного хранения и передачи информации в локальной сети.',
        advantages: 'Входит в ТОП-50 востребованных специальностей; Возможность свободного графика работы; Востребованность на рынке труда; Высокая заработная плата; Карьерный рост.'
      },
      {
        code: '09.02.07',
        name: 'Информационные системы и программирование',
        duration: '3 года 10 месяцев',
        qualification: 'Программист, технический писатель, специалист по тестированию программного обеспечения',
        description: 'Программист, технический писатель, специалист по тестированию программного обеспечения занимается разработкой модулей программного обеспечения для компьютерных систем, осуществлением интеграции программных модулей, написанием различных программ.',
        advantages: 'Востребованность на рынке труда; Высокая заработная плата; Возможность удаленной работы (фриланс); Карьерный рост; Интересные творческие проекты.'
      },
      {
        code: '11.02.15',
        name: 'Инфокоммуникационные сети и системы связи',
        duration: '3 года 10 месяцев',
        qualification: 'Специалист по монтажу и обслуживанию телекоммуникаций',
        description: 'Специалист по монтажу и обслуживанию телекоммуникаций занимается проектированием систем и сетей связи, монтажом оборудования связи, технической поддержкой пользователей услуг связи.',
        advantages: 'Входит в ТОП-50 востребованных специальностей; Широкий профиль специализации; Комплексное знание профессии; Высокая заработная плата; Карьерный рост; Стабильный график работы.'
      },
      {
        code: '42.02.01',
        name: 'Реклама',
        duration: '3 года 10 месяцев',
        qualification: 'Специалист по рекламе',
        description: 'Специалист по рекламе занимается формированием отношений с общественностью, продвижением нового продукта, созданием дизайна рекламного продукта с использованием фото и видео.',
        advantages: 'Участие во множестве мероприятий; Общение с интересными людьми; Стремительный карьерный рост; Гибкий график работы; Новизна.'
      },
      {
        code: '11.02.12',
        name: 'Почтовая связь',
        duration: '2 года 10 месяцев',
        qualification: 'Специалист почтовой связи',
        description: 'Специалист почтовой связи занимается организацией работ по предоставлению услуг почтовой связи. Решает задачи маркетинга услуг почтовой связи и осуществляет их техническую эксплуатацию.',
        advantages: 'Развитая коммуникабельность специалиста; Стремительный карьерный рост; Гибкий график работы; Востребованность специалистов на предприятии; Сотрудничество с социальными партнерами; Инновации.'
      },
      {
        code: '10.02.05',
        name: 'Обеспечение информационной безопасности автоматизированных систем',
        duration: '3 года 10 месяцев',
        qualification: 'Специалист по информационной безопасности',
        description: 'Специалист по информационной безопасности занимается защитой информации в компьютерных системах, выявлением и устранением уязвимостей, настройкой средств защиты и мониторингом безопасности информационных систем.',
        advantages: 'Входит в ТОП-50 востребованных специальностей; Высокий уровень заработной платы; Постоянное развитие в профессии; Возможность работы в государственных и коммерческих структурах; Высокая востребованность на рынке труда.'
      },
      {
        code: '11.02.16',
        name: 'Монтаж, техническое обслуживание и ремонт электронных приборов',
        duration: '3 года 10 месяцев',
        qualification: 'Специалист по электронным приборам и устройствам',
        description: 'Выпускник должен быть готов к профессиональной деятельности в следующих областях: Производство электрооборудования, электронного и оптического оборудования; Сквозные виды профессиональной деятельности в промышленности.',
        advantages: 'Выполнение сборки, монтажа и демонтажа электронных приборов и устройств; Проведение технического обслуживания и ремонта электронных приборов и устройств; Проектирование электронных приборов и устройств на основе печатного монтажа.'
      },
      {
        code: '54.02.01',
        name: 'Дизайн (по отраслям)',
        duration: '2 года 10 месяцев и 3 года 10 месяцев',
        qualification: 'Дизайнер',
        description: 'В зависимости от вида деятельности специалиста по дизайну выделяют несколько основных отраслей данной профессии: промышленный (оформление и создание бытовой техники, транспорта, орудий труда, мебели); дизайн среды (создание интерьеров, оформление зданий, участков); дизайн одежды.',
        advantages: 'Творческая реализация; Широкая сфера применения навыков; Возможность работы фрилансером; Востребованность на рынке труда; Постоянное развитие в профессии.'
      }
    ];

    // Добавляем документы приемной комиссии
    const admissionDocuments = [
      { name: 'Правила приема обучающихся на 2025/26 учебный год', category: 'admission' },
      { name: 'Образец договора об оказании платных образовательных услуг', category: 'admission' },
      { name: 'Перечень специальностей', category: 'admission' },
      { name: 'Памятка о приеме сирот (в том числе под попечительством)', category: 'admission' },
      { name: 'Положение о вступительных испытаниях в ОБПОУ "КИТ"', category: 'admission' },
      { name: 'Информация о формах вступительных испытаний и формах их проведения', category: 'admission' },
      { name: 'Правила подачи и рассмотрения апелляций по результатам вступительных испытаний', category: 'admission' },
      { name: 'Приказ об утверждении стоимости обучения на 2025/2026 учебный год', category: 'admission' },
      { name: 'Информация об общежитии', category: 'admission' },
      { name: 'Справка формы 086', category: 'admission' },
      { name: 'Мед.заключение о принадлежности к мед.группе ФЗ', category: 'admission' }
    ];

    // Настройки приемной комиссии
    const settings = [
      { key: 'admission_schedule', value: 'ПН - ПТ с 09:00 до 17:00\nСБ - с 09:00 до 13:00' },
      { key: 'admission_address', value: 'ул. С. Перовской, 16. 2 этаж, ауд. 22' },
      { key: 'admission_phone', value: '(471) 254-09-32' },
      { key: 'admission_email', value: 'zavuch@kts46.ru' },
      { key: 'admission_responsible', value: 'Авдеева Мария Валерьевна, заместитель директора по УР' },
      { key: 'welcome_message', value: '👋 Добро пожаловать в чат-бот Абитуриента ОБПОУ "КИТ"! Здесь вы можете узнать о специальностях колледжа, необходимых документах для поступления, проверить свой рейтинг в списке поступающих и многое другое. Выберите интересующий вас раздел в меню.' }
    ];

    // Начальные данные для галереи
    const gallery = [
      { title: 'Главный корпус КИТ', image_url: 'https://example.com/gallery/building.jpg', type: 'image' },
      { title: 'Лаборатория программирования', image_url: 'https://example.com/gallery/lab.jpg', type: 'image' },
      { title: 'Студенческая жизнь', image_url: 'https://example.com/gallery/students.jpg', type: 'image' }
    ];

    // Наполняем базу данных начальными данными
    db.serialize(() => {
      // Добавляем специальности
      const stmt1 = db.prepare(`INSERT INTO specialties 
        (code, name, duration, qualification, description, advantages, image_url, plan_url) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      
      specialties.forEach(specialty => {
        stmt1.run(
          specialty.code, 
          specialty.name, 
          specialty.duration, 
          specialty.qualification, 
          specialty.description, 
          specialty.advantages,
          null,  // image_url
          null   // plan_url
        );
      });
      stmt1.finalize();

      // Добавляем документы
      const stmt2 = db.prepare(`INSERT INTO documents (name, category) VALUES (?, ?)`);
      admissionDocuments.forEach(doc => {
        stmt2.run(doc.name, doc.category);
      });
      stmt2.finalize();

      // Добавляем настройки
      const stmt3 = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`);
      settings.forEach(setting => {
        stmt3.run(setting.key, setting.value);
      });
      stmt3.finalize();

      // Добавляем элементы галереи
      const stmt4 = db.prepare(`INSERT INTO gallery (title, image_url, type) VALUES (?, ?, ?)`);
      gallery.forEach(item => {
        stmt4.run(item.title, item.image_url, item.type);
      });
      stmt4.finalize();

      // Устанавливаем лимиты бюджетных мест по умолчанию
      db.get(`SELECT COUNT(*) as count FROM budget_limits`, [], (err, row) => {
        if (err || row.count > 0) return;
        
        db.all(`SELECT id FROM specialties`, [], (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          
          const stmt5 = db.prepare(`INSERT INTO budget_limits (specialty_id, budget_limit) VALUES (?, ?)`);
          rows.forEach(row => {
            stmt5.run(row.id, 25); // По умолчанию 25 бюджетных мест
          });
          stmt5.finalize();
          
          resolve();
        });
      });
    });
  });
}

// Экспортируем функции и объект базы данных
module.exports = {
  db,
  initDatabase
};