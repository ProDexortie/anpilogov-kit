// app.js - Основной файл приложения
const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs'); // Добавьте эту строку
const { initDatabase } = require('./database');
const bot = require('./bot');
const adminRouter = require('./admin');
require('dotenv').config();

// Создаем экземпляр Express-приложения
const app = express();

// Настройка шаблонизатора
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Настройка статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// Настройка обработки тела запроса
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Настройка сессий с файловым хранилищем
const FileStore = require('session-file-store')(session);

app.use(session({
  store: new FileStore({
    path: path.join(__dirname, 'sessions')
  }),
  secret: process.env.SESSION_SECRET || 'kit-admissions-secret',
  resave: true,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24 часа
  }
}));
// Отладочное промежуточное ПО для отслеживания сессий
app.use((req, res, next) => {
  console.log('Сессия в промежуточном ПО:', req.session);
  next();
});

// Маршрут для главной страницы
app.get('/', (req, res) => {
  res.render('index', { title: 'Бот для абитуриентов ОБПОУ "КИТ"' });
});

// Маршруты админ-панели
app.use('/admin', adminRouter);

// Обработка ошибки 404
app.use((req, res, next) => {
  res.status(404).render('error', { 
    title: 'Страница не найдена',
    message: 'Запрашиваемая страница не существует.'
  });
});

// Обработка ошибок сервера
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { 
    title: 'Ошибка сервера',
    message: 'Произошла внутренняя ошибка сервера.'
  });
});

// Запуск приложения
async function startApp() {
  try {
    // Инициализация базы данных
    await initDatabase();
    console.log('База данных инициализирована');
    
    // Запуск бота
    bot.launch();
    console.log('Бот запущен');
    
    // Запуск веб-сервера
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Сервер запущен на порту ${PORT}`);
      console.log(`Админ-панель доступна по адресу: http://localhost:${PORT}/admin`);
    });
    
    // Обработка завершения работы
    process.once('SIGINT', () => {
      bot.stop('SIGINT');
      console.log('Бот остановлен');
    });
    
    process.once('SIGTERM', () => {
      bot.stop('SIGTERM');
      console.log('Бот остановлен');
    });
  } catch (error) {
    console.error('Ошибка при запуске приложения:', error);
    process.exit(1);
  }
}

// Добавьте файл error.ejs для обработки ошибок
// views/error.ejs содержит простой шаблон страницы ошибки

// Функция для создания вебхука (если нужно)
async function setupWebhook() {
  if (process.env.NODE_ENV === 'production' && process.env.APP_URL) {
    try {
      const webhookUrl = `${process.env.APP_URL}/webhook`;
      await bot.telegram.setWebhook(webhookUrl);
      console.log(`Вебхук установлен на ${webhookUrl}`);
    } catch (error) {
      console.error('Ошибка при настройке вебхука:', error);
    }
  }
}

// Маршрут для вебхука Telegram (если нужно)
app.post('/webhook', (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

// Запуск приложения
startApp();