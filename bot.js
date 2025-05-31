const { Telegraf, Markup, Scenes, session } = require('telegraf');
const { WizardScene } = require('telegraf/scenes');
const { db } = require('./database');
const nodemailer = require('nodemailer');
const LocalSession = require('telegraf-session-local');

require('dotenv').config();

// Создаем экземпляр бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Настройка локального хранилища сессий
const localSession = new LocalSession({
  database: 'sessions.json',
  property: 'session',
  storage: LocalSession.storageMemory
});

// Использование сессий
bot.use(localSession.middleware());

// Настройка транспорта для отправки почты
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Middleware для инициализации сессии
bot.use((ctx, next) => {
  console.log('Middleware сессии');
  ctx.session = ctx.session || {};
  return next();
});

// Эмодзи для стилизации
const EMOJIS = {
  welcome: '👋',
  specialties: '🎓',
  documents: '📄',
  admission: '📝',
  rating: '📊',
  education: '📚',
  gallery: '🖼️',
  back: '🔙',
  info: 'ℹ️',
  calendar: '📅',
  location: '📍',
  phone: '📞',
  email: '📧',
  person: '👨‍💼',
  download: '⬇️',
  check: '✅',
  warning: '⚠️',
  star: '⭐',
  rocket: '🚀',
  medal: '🏅',
  money: '💰',
  clock: '⏰',
  search: '🔍'
};

// Сцена для сбора данных заявки
bot.action(/apply_(\d+)/, async (ctx) => {
  try {
    const specialtyId = ctx.match[1];
    console.log('Выбранный specialtyId:', specialtyId);

    const specialty = await getSpecialtyById(specialtyId);
    
    if (!specialty) {
      await ctx.answerCbQuery('Информация о данной специальности недоступна');
      return;
    }
    
    await ctx.answerCbQuery();
    
    await ctx.scene.enter('APPLICATION_WIZARD', {
      specialtyId: Number(specialtyId)
    });
  } catch (error) {
    console.error('Ошибка при обработке подачи заявки:', error);
    await ctx.answerCbQuery('Произошла ошибка');
    return ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

// Сцена подачи заявки
const applicationWizard = new Scenes.WizardScene(
  'APPLICATION_WIZARD',
  async (ctx) => {
    console.log('Вход в сцену APPLICATION_WIZARD');
    
    const specialtyId = ctx.scene.state?.specialtyId;
    console.log('specialtyId из state:', specialtyId);

    if (!specialtyId) {
      await ctx.reply('Произошла ошибка. Пожалуйста, выберите специальность заново.');
      return ctx.scene.leave();
    }

    const specialty = await getSpecialtyById(specialtyId);
    
    const existingApplication = await checkExistingApplication(ctx.from.id, specialtyId);
    
    if (existingApplication) {
      await ctx.reply(
        `${EMOJIS.warning} Вы уже подали заявку на эту специальность. Статус вашей заявки: *${existingApplication.status}*.\n\nЕсли у вас есть вопросы, обратитесь в приёмную комиссию.`,
        { parse_mode: 'Markdown' }
      );
      return ctx.scene.leave();
    }
    
    await ctx.reply(
      `${EMOJIS.person} Пожалуйста, введите ваше *полное ФИО*:`,
      { 
        parse_mode: 'Markdown',
        ...Markup.keyboard([
          [`${EMOJIS.back} Отменить подачу заявки`]
        ]).resize()
      }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message.text === `${EMOJIS.back} Отменить подачу заявки`) {
      await ctx.reply(
        'Подача заявки отменена.',
        Markup.keyboard([
          [`${EMOJIS.back} К списку специальностей`],
          [`${EMOJIS.back} Главное меню`]
        ]).resize()
      );
      return ctx.scene.leave();
    }
    
    ctx.scene.state.fullName = ctx.message.text;
    
    await ctx.reply(
      `${EMOJIS.phone} Пожалуйста, введите ваш *номер телефона* в формате +7XXXXXXXXXX:`,
      { 
        parse_mode: 'Markdown',
        ...Markup.keyboard([
          [`${EMOJIS.back} Отменить подачу заявки`]
        ]).resize()
      }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message.text === `${EMOJIS.back} Отменить подачу заявки`) {
      await ctx.reply(
        'Подача заявки отменена.',
        Markup.keyboard([
          [`${EMOJIS.back} К списку специальностей`],
          [`${EMOJIS.back} Главное меню`]
        ]).resize()
      );
      return ctx.scene.leave();
    }
    
    ctx.scene.state.phone = ctx.message.text;
    
    const specialty = await getSpecialtyById(ctx.scene.state.specialtyId);

    if (!specialty) {
      await ctx.reply(
        `${EMOJIS.warning} Информация о выбранной специальности недоступна. Пожалуйста, выберите специальность заново.`,
        { 
          parse_mode: 'Markdown',
          ...Markup.keyboard([
            [`${EMOJIS.back} К списку специальностей`],
            [`${EMOJIS.back} Главное меню`]
          ]).resize()
        }
      );
      return ctx.scene.leave();
    }

    await ctx.reply(
      `${EMOJIS.check} Пожалуйста, проверьте данные вашей заявки:\n\n` +
      `*Специальность:* ${specialty.code} ${specialty.name}\n` +
      `*ФИО:* ${ctx.scene.state.fullName}\n` +
      `*Телефон:* ${ctx.scene.state.phone}\n\n` +
      `Всё верно?`,
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Да, отправить заявку', 'confirm_application'),
            Markup.button.callback('❌ Нет, отменить', 'cancel_application')
          ]
        ])
      }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    return;
  }
);

// Обработчик подтверждения заявки
bot.action('confirm_application', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const { specialtyId, fullName, phone } = ctx.scene.state;
    const userId = ctx.from.id;
    
    const specialty = await getSpecialtyById(specialtyId);
    
    await saveApplication(userId, specialtyId, fullName, phone);
    
    await sendApplicationEmail(specialty, fullName, phone);
    
    await ctx.reply(
      `${EMOJIS.check} Ваша заявка на специальность "${specialty.code} ${specialty.name}" успешно отправлена!\n\n` +
      `В ближайшее время с вами свяжется представитель приёмной комиссии для подтверждения заявки и уточнения деталей.\n\n` +
      `${EMOJIS.calendar} *График работы приёмной комиссии:*\n` +
      `ПН - ПТ с 09:00 до 17:00\n` +
      `СБ - с 09:00 до 13:00\n\n` +
      `${EMOJIS.location} *Адрес:*\n` +
      `ул. С. Перовской, 16. 2 этаж, ауд. 22\n\n` +
      `${EMOJIS.phone} *Телефон:*\n` +
      `(471) 254-09-32\n\n` +
      `При себе необходимо иметь документы, указанные в разделе "${EMOJIS.documents} Документы для поступления".`,
      { 
        parse_mode: 'Markdown',
        ...Markup.keyboard([
          [`${EMOJIS.back} Главное меню`]
        ]).resize()
      }
    );
    
    return ctx.scene.leave();
  } catch (error) {
    console.error('Ошибка при подтверждении заявки:', error);
    await ctx.reply('Произошла ошибка при отправке заявки. Пожалуйста, попробуйте позже или обратитесь в приёмную комиссию.');
    return ctx.scene.leave();
  }
});

// Обработчик отмены заявки
bot.action('cancel_application', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    'Подача заявки отменена.',
    Markup.keyboard([
      [`${EMOJIS.back} К списку специальностей`],
      [`${EMOJIS.back} Главное меню`]
    ]).resize()
  );
  return ctx.scene.leave();
});

// Функция для проверки существующей заявки
function checkExistingApplication(userId, specialtyId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM applications 
       WHERE user_id = ? AND specialty_id = ?`,
      [userId, specialtyId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

// Функция для сохранения заявки
function saveApplication(userId, specialtyId, fullName, phone) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO applications (user_id, specialty_id, full_name, phone)
       VALUES (?, ?, ?, ?)`,
      [userId, specialtyId, fullName, phone],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

// Функция для отправки уведомления на почту
async function sendApplicationEmail(specialty, fullName, phone) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_TO,
    subject: `Новая заявка на поступление: ${specialty.code} ${specialty.name}`,
    text: `
      Получена новая заявка на поступление:
      
      Специальность: ${specialty.code} ${specialty.name}
      ФИО: ${fullName}
      Телефон: ${phone}
      Дата: ${new Date().toLocaleString('ru-RU')}
    `,
    html: `
      <h2>Получена новая заявка на поступление</h2>
      <p><strong>Специальность:</strong> ${specialty.code} ${specialty.name}</p>
      <p><strong>ФИО:</strong> ${fullName}</p>
      <p><strong>Телефон:</strong> ${phone}</p>
      <p><strong>Дата:</strong> ${new Date().toLocaleString('ru-RU')}</p>
    `
  };

  return transporter.sendMail(mailOptions);
}

// Создаем менеджер сцен
const stage = new Scenes.Stage([applicationWizard]);
bot.use(stage.middleware());

// Основное меню
const mainMenu = async (ctx) => {
  try {
    const welcomeRow = await getSettingByKey('welcome_message');
    const welcomeMessage = welcomeRow ? welcomeRow.value : 
      `${EMOJIS.welcome} Добро пожаловать в чат-бот Абитуриента ОБПОУ "КИТ"!`;
    
    const menu = Markup.keyboard([
      [`${EMOJIS.specialties} Специальности`],
      [`${EMOJIS.admission} Приёмная комиссия`],
      [`${EMOJIS.documents} Документы для поступления`],
      [`${EMOJIS.rating} Узнать свой рейтинг`],
      [`${EMOJIS.education} Дополнительное профессиональное образование`],
      [`${EMOJIS.gallery} Жизнь в КИТ`]
    ]).resize();
    
    console.log('Отображение главного меню с командами:', menu.reply_markup.keyboard);
    
    return ctx.reply(welcomeMessage, menu);
  } catch (error) {
    console.error('Ошибка в mainMenu:', error);
    return ctx.reply('Произошла ошибка при загрузке меню. Пожалуйста, попробуйте позже.');
  }
};

// Обработчик команды /start
bot.start(mainMenu);

// Обработчик кнопки возврата в главное меню
bot.hears(`${EMOJIS.back} Главное меню`, mainMenu);

// Получение настройки из БД
function getSettingByKey(key) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT value FROM settings WHERE key = ?`, [key], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Получение списка специальностей из БД
function getSpecialties() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM specialties ORDER BY code`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Получение информации о специальности по ID
function getSpecialtyById(id) {
  return new Promise((resolve, reject) => {
    console.log(`Запрос специальности с ID: ${id}`);
    db.get(`SELECT * FROM specialties WHERE id = ?`, [id], (err, row) => {
      if (err) {
        console.error(`Ошибка базы данных при получении специальности: ${err}`);
        reject(err);
      } else {
        if (!row) {
          console.warn(`Специальность с ID ${id} не найдена`);
          db.all(`SELECT id, code, name FROM specialties`, [], (allErr, allRows) => {
            if (allErr) {
              console.error(`Ошибка получения списка специальностей: ${allErr}`);
            } else {
              console.log('Существующие специальности:', allRows.map(r => `ID: ${r.id}, Код: ${r.code}, Название: ${r.name}`));
            }
          });
        }
        resolve(row);
      }
    });
  });
}

// Получение документов по категории
function getDocumentsByCategory(category) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM documents WHERE category = ?`, [category], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Получение информации об абитуриенте по фамилии и специальности
function getApplicantRating(fullName, specialtyId) {
  return new Promise((resolve, reject) => {
    console.log("Запрос рейтинга для:", fullName, "ID специальности:", specialtyId);
    
    const query = `
      SELECT a.*, 
             (SELECT COUNT(*) FROM applicants 
              WHERE specialty_id = ? AND points >= a.points) as rating,
             (SELECT budget_limit FROM budget_limits WHERE specialty_id = ?) as budget_limit
      FROM applicants a
      WHERE a.full_name LIKE ? AND a.specialty_id = ?
    `;
    
    db.get(query, [specialtyId, specialtyId, `%${fullName}%`, specialtyId], (err, row) => {
      if (err) {
        console.error("Ошибка SQL при поиске абитуриента:", err);
        reject(err);
      } else {
        console.log("Результат поиска абитуриента:", row);
        resolve(row);
      }
    });
  });
}

// Получение элементов галереи
function getGalleryItems() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM gallery ORDER BY id`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Обработчик раздела "Специальности"
bot.hears(`${EMOJIS.specialties} Специальности`, async (ctx) => {
  try {
    const specialties = await getSpecialties();
    
    if (specialties.length === 0) {
      return ctx.reply('Информация о специальностях в данный момент недоступна.');
    }
    
    const buttons = specialties.map(specialty => [
      Markup.button.callback(`${specialty.code} ${specialty.name}`, `specialty_${specialty.id}`)
    ]);
    
    buttons.push([Markup.button.text(`${EMOJIS.back} Главное меню`)]);
    
    return ctx.reply(
      `${EMOJIS.specialties} *Выберите специальность для получения подробной информации:*`,
      Markup.keyboard(buttons).resize()
    );
  } catch (error) {
    console.error('Ошибка в разделе Специальности:', error);
    return ctx.reply('Произошла ошибка при загрузке специальностей. Пожалуйста, попробуйте позже.');
  }
});

// Обработчик выбора специальности (по коду специальности)
bot.hears(/^[0-9]{2}\.[0-9]{2}\.[0-9]{2} .+/, async (ctx) => {
  try {
    const specialtyCode = ctx.message.text.split(' ')[0];
    
    db.get(`SELECT id FROM specialties WHERE code = ?`, [specialtyCode], async (err, row) => {
      if (err || !row) {
        return ctx.reply('Информация о данной специальности недоступна.');
      }
      
      await showSpecialtyInfo(ctx, row.id);
    });
  } catch (error) {
    console.error('Ошибка при обработке выбора специальности:', error);
    return ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

// Функция отображения информации о специальности
async function showSpecialtyInfo(ctx, specialtyId) {
  try {
    const specialty = await getSpecialtyById(specialtyId);
    
    if (!specialty) {
      return ctx.reply('Информация о данной специальности недоступна.');
    }
    
    let message = `${EMOJIS.star} *${specialty.code} ${specialty.name}*\n\n`;
    message += `${EMOJIS.clock} *Срок обучения:* ${specialty.duration}\n\n`;
    message += `${EMOJIS.medal} *Квалификация:* ${specialty.qualification}\n\n`;
    message += `${EMOJIS.info} *Описание:*\n${specialty.description}\n\n`;
    message += `${EMOJIS.rocket} *Преимущества специальности:*\n${specialty.advantages.split(';').map(adv => `• ${adv.trim()}`).join('\n')}`;
    
    let image_url = specialty.image_url;
    if (image_url && !image_url.startsWith('http')) {
      const baseUrl = process.env.APP_URL || 'https://your-glitch-project.glitch.me';
      image_url = `${baseUrl}${image_url}`;
    }
    
    let plan_url = specialty.plan_url;
    if (plan_url && !plan_url.startsWith('http')) {
      const baseUrl = process.env.APP_URL || 'https://your-glitch-project.glitch.me';
      plan_url = `${baseUrl}${plan_url}`;
    }
    
    try {
      if (image_url) {
        console.log("Попытка отправить изображение:", image_url);
        await ctx.replyWithPhoto(
          { url: image_url },
          { caption: `${EMOJIS.specialties} ${specialty.code} ${specialty.name}` }
        );
      }
    } catch (imageError) {
      console.error('Ошибка при отправке изображения:', imageError);
    }
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        [`${EMOJIS.back} К списку специальностей`],
        [`${EMOJIS.back} Главное меню`]
      ]).resize()
    });
    
    const inlineButtons = [];
    
    if (plan_url) {
      console.log("Ссылка на учебный план:", plan_url);
      inlineButtons.push([
        Markup.button.url(`${EMOJIS.download} Скачать учебный план`, plan_url)
      ]);
    }
    
    inlineButtons.push([
      Markup.button.callback(`${EMOJIS.check} Подать заявку`, `apply_${specialty.id}`)
    ]);
    
    if (inlineButtons.length > 0) {
      await ctx.reply('Действия:', 
        Markup.inlineKeyboard(inlineButtons)
      );
    }
  } catch (error) {
    console.error('Ошибка при отображении информации о специальности:', error);
    return ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
}

// Обработчик кнопки возврата к списку специальностей
bot.hears(`${EMOJIS.back} К списку специальностей`, async (ctx) => {
  try {
    const specialties = await getSpecialties();
    
    if (specialties.length === 0) {
      return ctx.reply('Информация о специальностях в данный момент недоступна.');
    }
    
    const buttons = specialties.map(specialty => [
      Markup.button.callback(`${specialty.code} ${specialty.name}`, `specialty_${specialty.id}`)
    ]);
    
    buttons.push([Markup.button.text(`${EMOJIS.back} Главное меню`)]);
    
    return ctx.reply(
      `${EMOJIS.specialties} *Выберите специальность для получения подробной информации:*`,
      Markup.keyboard(buttons).resize()
    );
  } catch (error) {
    console.error('Ошибка в разделе Специальности:', error);
    return ctx.reply('Произошла ошибка при загрузке специальностей. Пожалуйста, попробуйте позже.');
  }
});

// Обработчик выбора специальности для рейтинга
bot.hears(/^Рейтинг: [0-9]{2}\.[0-9]{2}\.[0-9]{2} .+/, async (ctx) => {
  try {
    // Получаем код специальности из текста кнопки
    const text = ctx.message.text;
    const specialtyCode = text.split(' ')[1]; // "Рейтинг: 09.02.07 Название" -> "09.02.07"
    
    console.log("Выбрана специальность для рейтинга:", specialtyCode);
    
    // Получаем ID специальности по коду
    db.get(`SELECT id, name FROM specialties WHERE code = ?`, [specialtyCode], async (err, specialty) => {
      if (err || !specialty) {
        console.error("Ошибка при получении специальности:", err);
        return ctx.reply('Информация о данной специальности недоступна.');
      }
      
      // Сохраняем ID специальности в сессии пользователя
      ctx.session = ctx.session || {};
      ctx.session.ratingSpecialtyId = specialty.id;
      ctx.session.ratingSpecialtyName = specialty.name;
      ctx.session.ratingSpecialtyCode = specialtyCode;
      
      // Устанавливаем флаг ожидания фамилии
      ctx.session.awaitingRatingLastName = true;
      
      await ctx.reply(
        `${EMOJIS.search} Пожалуйста, введите вашу *фамилию* для проверки рейтинга в списке абитуриентов на специальность "${specialtyCode} ${specialty.name}":`,
        { 
          parse_mode: 'Markdown',
          ...Markup.keyboard([
            [`${EMOJIS.back} Главное меню`]
          ]).resize()
        }
      );
    });
  } catch (error) {
    console.error('Ошибка при выборе специальности для рейтинга:', error);
    return ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

// Обработчик раздела "Приёмная комиссия"
bot.hears(`${EMOJIS.admission} Приёмная комиссия`, async (ctx) => {
  try {
    const scheduleRow = await getSettingByKey('admission_schedule');
    const addressRow = await getSettingByKey('admission_address');
    const phoneRow = await getSettingByKey('admission_phone');
    const emailRow = await getSettingByKey('admission_email');
    const responsibleRow = await getSettingByKey('admission_responsible');
    
    let message = `${EMOJIS.admission} *Приёмная комиссия ОБПОУ "Колледж информационных технологий"*\n\n`;
    
    if (scheduleRow) {
      message += `${EMOJIS.calendar} *График работы:*\n${scheduleRow.value}\n\n`;
    }
    
    if (addressRow) {
      message += `${EMOJIS.location} *Адрес:*\n${addressRow.value}\n\n`;
    }
    
    if (phoneRow) {
      message += `${EMOJIS.phone} *Телефон:*\n${phoneRow.value}\n\n`;
    }
    
    if (emailRow) {
      message += `${EMOJIS.email} *Email:*\n${emailRow.value}\n\n`;
    }
    
    if (responsibleRow) {
      message += `${EMOJIS.person} *Ответственный:*\n${responsibleRow.value}\n\n`;
    }
    
    const documents = await getDocumentsByCategory('admission');
    
    if (documents.length > 0) {
      message += `${EMOJIS.documents} *Документы приёмной комиссии:*\n`;
      
      const documentButtons = documents.map(doc => [
        Markup.button.callback(`${EMOJIS.download} ${doc.name}`, `document_${doc.id}`)
      ]);
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
          [`${EMOJIS.back} Главное меню`]
        ]).resize()
      });
      
      return ctx.reply('Выберите документ для просмотра:', 
        Markup.inlineKeyboard(documentButtons)
      );
    } else {
      return ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
          [`${EMOJIS.back} Главное меню`]
        ]).resize()
      });
    }
  } catch (error) {
    console.error('Ошибка в разделе Приёмная комиссия:', error);
    return ctx.reply('Произошла ошибка при загрузке информации. Пожалуйста, попробуйте позже.');
  }
});

// Обработчик инлайн-кнопки скачивания документа
bot.action(/document_(\d+)/, async (ctx) => {
  try {
    const documentId = ctx.match[1];
    
    db.get(`SELECT * FROM documents WHERE id = ?`, [documentId], async (err, document) => {
      if (err || !document) {
        await ctx.answerCbQuery('Документ недоступен');
        return;
      }
      
      await ctx.answerCbQuery();
      
      if (!document.file_url) {
        return ctx.reply(`Документ "${document.name}" будет доступен в ближайшее время.`);
      }
      
      let fileUrl = document.file_url;
      if (!fileUrl.startsWith('http')) {
        const baseUrl = process.env.APP_URL || 'https://your-glitch-project.glitch.me';
        fileUrl = `${baseUrl}${fileUrl}`;
      }
      
      console.log("Ссылка на документ:", fileUrl);
      
      try {
        return ctx.reply(
          `Документ "${document.name}" доступен по ссылке:\n${fileUrl}`,
          { disable_web_page_preview: false }
        );
      } catch (fileError) {
        console.error('Ошибка при отправке файла:', fileError);
        return ctx.reply(`Документ "${document.name}" сейчас недоступен. Пожалуйста, обратитесь в приёмную комиссию.`);
      }
    });
  } catch (error) {
    console.error('Ошибка при скачивании документа:', error);
    await ctx.answerCbQuery('Произошла ошибка');
  }
});

// Обработчик раздела "Документы для поступления"
bot.hears(`${EMOJIS.documents} Документы для поступления`, async (ctx) => {
  try {
    let message = `${EMOJIS.documents} *Документы для поступления*\n\n`;
    
    message += `*Для граждан Российской Федерации:*\n`;
    message += `• Оригинал документов, удостоверяющих личность и гражданство\n`;
    message += `• Оригинал документов об образовании и (или) документа об образовании и о квалификации\n`;
    message += `• Согласие на обработку данных\n`;
    message += `• Фотографии – 4 шт. (размер 3х4)\n`;
    message += `• СНИЛС\n`;
    message += `• Медицинская справка, форма 086-У\n\n`;
    
    message += `*Дополнительно (при наличии):*\n`;
    message += `• Документы, подтверждающие статус лица с инвалидностью (заключение МСЭ, карта ИПРА) или ОВЗ (заключение ПМПК)\n`;
    message += `• Документы, подтверждающие статус сироты\n`;
    message += `• Заявление на общежитие (при необходимости)\n\n`;
    
    message += `${EMOJIS.warning} ОРИГИНАЛ документа об образовании (аттестата) и (или) документа об образовании и о квалификации (диплома) необходимо предоставить до окончания срока приёма документов.\n\n`;
    
    message += `*Для иностранных граждан:*\n`;
    message += `• Копию документа, удостоверяющего личность поступающего, либо документ, удостоверяющий личность иностранного гражданина в Российской Федерации\n`;
    message += `• Оригинал документа иностранного государства об образовании\n`;
    message += `• Заверенный перевод на русский язык документа иностранного государства об образовании\n`;
    message += `• Копии документов, подтверждающих принадлежность соотечественника, проживающего за рубежом\n`;
    message += `• Согласие на обработку данных\n`;
    message += `• Фотографии – 4 шт. (размер 3х4)\n\n`;
    
    message += `${EMOJIS.info} Поступающий вправе предоставить оригинал или копию документов, подтверждающих результаты индивидуальных достижений, а также копию договора о целевом обучении.`;
    
    return ctx.reply(message, {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        [`${EMOJIS.back} Главное меню`]
      ]).resize()
    });
  } catch (error) {
    console.error('Ошибка в разделе Документы для поступления:', error);
    return ctx.reply('Произошла ошибка при загрузке информации. Пожалуйста, попробуйте позже.');
  }
});

// Обработчик раздела "Узнать свой рейтинг"
bot.hears(`${EMOJIS.rating} Узнать свой рейтинг`, async (ctx) => {
  try {
    // Получаем список специальностей
    const specialties = await getSpecialties();
    
    if (specialties.length === 0) {
      return ctx.reply('Информация о специальностях в данный момент недоступна.');
    }
    
    // Создаем кнопки с специальностями для рейтинга (используем обычные кнопки, не callback)
    const buttons = specialties.map(specialty => [
      Markup.button.text(`Рейтинг: ${specialty.code} ${specialty.name}`)
    ]);
    
    // Добавляем кнопку возврата в главное меню
    buttons.push([Markup.button.text(`${EMOJIS.back} Главное меню`)]);
    
    return ctx.reply(
      `${EMOJIS.search} Для проверки вашего рейтинга в списке абитуриентов, пожалуйста, выберите специальность:`,
      { 
        parse_mode: 'Markdown',
        ...Markup.keyboard(buttons).resize()
      }
    );
  } catch (error) {
    console.error('Ошибка в разделе Узнать свой рейтинг:', error);
    return ctx.reply('Произошла ошибка при загрузке информации. Пожалуйста, попробуйте позже.');
  }
});

// Обработчик раздела "Дополнительное профессиональное образование"
bot.hears(`${EMOJIS.education} Дополнительное профессиональное образование`, async (ctx) => {
  try {
    let message = `${EMOJIS.education} *Дополнительное профессиональное образование*\n\n`;
    message += `В ОБПОУ "КИТ" вы можете получить дополнительное профессиональное образование по различным направлениям:\n\n`;
    message += `• Информационные технологии и программирование\n`;
    message += `• Сетевое и системное администрирование\n`;
    message += `• Информационная безопасность\n`;
    message += `• Веб-дизайн и компьютерная графика\n\n`;
    message += `Для получения подробной информации о программах ДПО, сроках и стоимости обучения, пожалуйста, обратитесь в приёмную комиссию колледжа.`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        [`${EMOJIS.back} Главное меню`]
      ]).resize()
    });
    
    return;
  } catch (error) {
    console.error('Ошибка в разделе ДПО:', error);
    return ctx.reply('Произошла ошибка при загрузке информации. Пожалуйста, попробуйте позже.');
  }
});

// Обработчик раздела "Жизнь в КИТ" (с изображениями и видео из gallery)
bot.hears(`${EMOJIS.gallery} Жизнь в КИТ`, async (ctx) => {
  try {
    console.log('Команда "Жизнь в КИТ" получена, начало обработки...');

    const galleryItems = await getGalleryItems();
    console.log('Полученные элементы галереи:', galleryItems);

    if (!galleryItems || galleryItems.length === 0) {
      console.log('Список элементов галереи пуст');
      return ctx.reply(
        `${EMOJIS.warning} В данный момент медиа недоступны.`,
        {
          parse_mode: 'Markdown',
          ...Markup.keyboard([[`${EMOJIS.back} Главное меню`]]).resize()
        }
      );
    }

    await ctx.reply(
      `${EMOJIS.gallery} *Жизнь в Колледже информационных технологий*\n\nПосмотрите фотографии и видео из жизни нашего колледжа!`,
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([[`${EMOJIS.back} Главное меню`]]).resize()
      }
    );
    console.log('Приветственное сообщение отправлено');

    for (const item of galleryItems) {
      try {
        if (!item.image_url) {
          console.warn(`Пропущено медиа с ID ${item.id}: отсутствует image_url`);
          await ctx.reply(`Медиа недоступно: отсутствует ссылка.`);
          continue;
        }

        let mediaUrl = item.image_url;
        if (!mediaUrl.startsWith('http')) {
          const baseUrl = process.env.APP_URL || 'https://your-glitch-project.glitch.me';
          mediaUrl = `${baseUrl}${mediaUrl}`;
        }
        console.log(`Попытка отправить медиа: ${mediaUrl}`);

        // Определяем тип медиа по расширению файла
        const isVideo = /\.(mp4|mov|avi)$/i.test(mediaUrl);
        const caption = item.caption || 'Жизнь в КИТ';

        if (isVideo) {
          await ctx.replyWithVideo(
            { url: mediaUrl },
            { caption }
          );
          console.log(`Видео с ID ${item.id} успешно отправлено`);
        } else {
          await ctx.replyWithPhoto(
            { url: mediaUrl },
            { caption }
          );
          console.log(`Изображение с ID ${item.id} успешно отправлено`);
        }

        // Задержка для предотвращения спама
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (mediaError) {
        console.error(`Ошибка при отправке медиа с ID ${item.id}:`, mediaError.message);
        await ctx.reply(`Не удалось загрузить медиа (ID: ${item.id}).`);
      }
    }

    await ctx.reply(
      'Чтобы узнать больше о жизни колледжа, следите за нашими новостями или обратитесь в приёмную комиссию.',
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([[`${EMOJIS.back} Главное меню`]]).resize()
      }
    );
    console.log('Финальное сообщение отправлено');
  } catch (error) {
    console.error('Общая ошибка в разделе "Жизнь в КИТ":', error);
    return ctx.reply(
      `${EMOJIS.warning} Произошла ошибка при загрузке медиа. Пожалуйста, попробуйте позже.`,
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([[`${EMOJIS.back} Главное меню`]]).resize()
      }
    );
  }
});
// Обработчик ввода фамилии для проверки рейтинга
bot.on('text', async (ctx) => {
  // Проверяем, ожидаем ли мы ввод фамилии
  if (ctx.session && ctx.session.awaitingRatingLastName && 
      !ctx.message.text.includes(EMOJIS.back)) {
    
    console.log("Получен ввод фамилии для рейтинга:", ctx.message.text);
    
    // Отмечаем, что сообщение уже обработано
    ctx.session.messageProcessed = true;
    
    try {
      const specialtyId = ctx.session.ratingSpecialtyId;
      const specialtyCode = ctx.session.ratingSpecialtyCode;
      const specialtyName = ctx.session.ratingSpecialtyName;
      const lastName = ctx.message.text.trim();
      
      if (!specialtyId) {
        return ctx.reply('Пожалуйста, сначала выберите специальность.');
      }
      
      console.log("Поиск абитуриента по фамилии:", lastName, "ID специальности:", specialtyId);
      
      // Получаем рейтинг абитуриента
      const applicant = await getApplicantRating(lastName, specialtyId);
      
      // Сбрасываем флаг ожидания
      ctx.session.awaitingRatingLastName = false;
      
      if (!applicant) {
        return ctx.reply(
          `${EMOJIS.warning} Абитуриент с фамилией "${lastName}" не найден в списке поступающих на специальность "${specialtyCode} ${specialtyName}".\n\nПожалуйста, проверьте правильность написания фамилии или обратитесь в приёмную комиссию.`,
          Markup.keyboard([
            [`${EMOJIS.rating} Узнать свой рейтинг`],
            [`${EMOJIS.back} Главное меню`]
          ]).resize()
        );
      }
      
      // Определяем статус (бюджет/внебюджет)
      let statusText = '';
      let statusEmoji = '';
      
      if (applicant.status === 'СВО') {
        statusText = 'Особый статус (СВО)';
        statusEmoji = '🎖️';
      } else if (applicant.rating <= applicant.budget_limit) {
        statusText = 'Бюджетное место';
        statusEmoji = '✅';
      } else {
        statusText = 'Внебюджетное место';
        statusEmoji = '💰';
      }
      
      let message = `${EMOJIS.rating} *Информация о рейтинге абитуриента*\n\n`;
      message += `*ФИО:* ${applicant.full_name}\n`;
      message += `*Специальность:* ${specialtyCode} ${specialtyName}\n`;
      message += `*Средний балл:* ${applicant.points}\n`;
      message += `*Текущая позиция в рейтинге:* ${applicant.rating}\n`;
      message += `*Статус:* ${statusEmoji} ${statusText}\n\n`;
      
      if (applicant.rating <= applicant.budget_limit) {
        message += `${EMOJIS.check} На текущий момент ваша позиция в рейтинге позволяет претендовать на *бюджетное место*.`;
      } else {
        message += `${EMOJIS.warning} На текущий момент ваша позиция в рейтинге не позволяет претендовать на бюджетное место. Вы можете поступить на *внебюджетное место* (платное обучение).`;
      }
      
      return ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
          [`${EMOJIS.rating} Узнать свой рейтинг`],
          [`${EMOJIS.back} Главное меню`]
        ]).resize()
      });
    } catch (error) {
      console.error('Ошибка при проверке рейтинга:', error);
      return ctx.reply('Произошла ошибка при проверке рейтинга. Пожалуйста, попробуйте позже.');
    }
  }
});

// Обработчик неизвестных сообщений
// Обработчик неизвестных сообщений НЕ связанных с рейтингом
bot.on('text', (ctx) => {
  // Если сообщение уже обработано другими обработчиками - игнорируем
  if (ctx.session && ctx.session.messageProcessed) {
    return;
  }
  
  // Если ожидаем ввод фамилии - не обрабатываем как неизвестное сообщение
  if (ctx.session && ctx.session.awaitingRatingLastName) {
    return;
  }
  
  // Если это не известная команда или кнопка меню
  if (!ctx.message.text.startsWith('/') && 
      !ctx.message.text.includes(`${EMOJIS.back} Главное меню`) &&
      !ctx.message.text.includes(`${EMOJIS.specialties} Специальности`) &&
      !ctx.message.text.includes(`${EMOJIS.admission} Приёмная комиссия`) &&
      !ctx.message.text.includes(`${EMOJIS.documents} Документы для поступления`) &&
      !ctx.message.text.includes(`${EMOJIS.rating} Узнать свой рейтинг`) &&
      !ctx.message.text.includes(`${EMOJIS.education} Дополнительное профессиональное образование`) &&
      !ctx.message.text.includes(`${EMOJIS.gallery} Жизнь в КИТ`) &&
      !ctx.message.text.includes(`Рейтинг: `)) {
    
    return ctx.reply(
      `Извините, я не понял вашу команду. Пожалуйста, воспользуйтесь меню для навигации.`,
      Markup.keyboard([
        [`${EMOJIS.back} Главное меню`]
      ]).resize()
    );
  }
});

// Запуск бота
bot.launch()
  .then(() => console.log('Бот успешно запущен'))
  .catch(err => console.error('Ошибка запуска бота:', err));

// Обработка остановки бота
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = bot;