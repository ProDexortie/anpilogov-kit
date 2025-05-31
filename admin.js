// admin.js - Административная панель для управления ботом

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const { db } = require('./database');
const router = express.Router();

// Добавьте в начало файла admin.js
router.get('/force-login', (req, res) => {
  req.session.authenticated = true;
  req.session.username = 'admin';
  
  req.session.save((err) => {
    if (err) {
      console.error('Ошибка сохранения сессии:', err);
      return res.send('Ошибка при сохранении сессии: ' + err.message);
    }
    
    return res.send(`
      <h1>Принудительный вход выполнен</h1>
      <p>Сессия: ${JSON.stringify(req.session)}</p>
      <p>Теперь вы должны иметь доступ к <a href="/admin">админ-панели</a>.</p>
    `);
  });
});
// Настройка мультера для загрузки файлов
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Определяем папку в зависимости от типа файла
    let uploadPath = path.join(__dirname, 'public', 'uploads');
    
    if (file.fieldname === 'specialty_image') {
      uploadPath = path.join(uploadPath, 'specialties');
    } else if (file.fieldname === 'document_file') {
      uploadPath = path.join(uploadPath, 'documents');
    } else if (file.fieldname === 'gallery_image') {
      uploadPath = path.join(uploadPath, 'gallery');
    } else if (file.fieldname === 'applicants_file') {
      uploadPath = path.join(uploadPath, 'applicants');
    }
    
    // Создаем папку, если её нет
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Генерируем уникальное имя файла
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Промежуточное ПО для проверки аутентификации
const checkAuth = (req, res, next) => {
  console.log("Проверка аутентификации. Сессия:", req.session);
  
  if (req.session && req.session.authenticated === true) {
    return next();
  }
  return res.redirect('/admin/login');
};
// Список заявок
router.get('/applications', checkAuth, (req, res) => {
  const sql = `
    SELECT a.*, s.code, s.name AS specialty_name, app.full_name, app.phone, app.status, app.created_at
    FROM applications app
    JOIN specialties s ON app.specialty_id = s.id
    ORDER BY app.created_at DESC
  `;
  
  db.all(sql, [], (err, applications) => {
    if (err) {
      return res.render('admin/applications', { 
        title: 'Заявки абитуриентов',
        applications: [],
        error: 'Ошибка при получении списка заявок'
      });
    }
    
    res.render('admin/applications', { 
      title: 'Заявки абитуриентов',
      applications: applications,
      error: null
    });
  });
});

// Изменение статуса заявки
router.post('/applications/update-status/:id', checkAuth, (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  
  db.run(`UPDATE applications SET status = ? WHERE id = ?`, [status, id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Ошибка при обновлении статуса заявки' });
    }
    
    res.redirect('/admin/applications');
  });
});
// Тестовый маршрут для проверки сессии
router.get('/test-session', (req, res) => {
  res.send(`
    <h1>Тест сессии</h1>
    <p>Сессия: ${JSON.stringify(req.session)}</p>
    <p>Аутентифицирован: ${req.session.authenticated ? 'Да' : 'Нет'}</p>
    <form action="/admin/login" method="POST">
      <input type="hidden" name="username" value="admin">
      <input type="hidden" name="password" value="kitadmin">
      <button type="submit">Войти с учетными данными по умолчанию</button>
    </form>
  `);
});

// Маршрут для входа в админ-панель
router.get('/login', (req, res) => {
  res.render('login', { title: 'Вход в админ-панель', error: null });
});

// Обработка входа
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  console.log("Попытка входа:", { username });
  
  // Дополнительная отладочная информация
  console.log("Текущая сессия до установки:", req.session);
  
  // Используем прямой доступ для admin/kitadmin
  if (username === 'admin' && password === 'kitadmin') {
    console.log("Учетные данные по умолчанию верны");
    
    // Явно устанавливаем флаг аутентификации
    req.session.authenticated = true;
    req.session.username = 'admin';
    
    // Принудительно сохраняем сессию перед редиректом
    req.session.save(function(err) {
      if (err) {
        console.error("Ошибка сохранения сессии:", err);
        return res.render('login', { 
          title: 'Вход в админ-панель', 
          error: 'Ошибка сохранения сессии, попробуйте снова'
        });
      }
      
      console.log("Сессия после сохранения:", req.session);
      return res.redirect('/admin');
    });
  } else {
    return res.render('login', { 
      title: 'Вход в админ-панель', 
      error: 'Неверное имя пользователя или пароль'
    });
  }
});

// Выход из админ-панели
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Главная страница админ-панели
router.get('/', checkAuth, (req, res) => {
  res.render('admin/dashboard', { title: 'Панель управления' });
});

// ==================== УПРАВЛЕНИЕ СПЕЦИАЛЬНОСТЯМИ ====================

// Список специальностей
router.get('/specialties', checkAuth, (req, res) => {
  db.all(`SELECT * FROM specialties ORDER BY code`, [], (err, specialties) => {
    if (err) {
      return res.render('admin/specialties', { 
        title: 'Управление специальностями',
        specialties: [],
        error: 'Ошибка при получении списка специальностей'
      });
    }
    
    res.render('admin/specialties', { 
      title: 'Управление специальностями',
      specialties: specialties,
      error: null
    });
  });
});

// Форма добавления специальности
router.get('/specialties/add', checkAuth, (req, res) => {
  res.render('admin/specialty_form', { 
    title: 'Добавление специальности',
    specialty: null,
    action: '/admin/specialties/add',
    error: null
  });
});

// Добавление специальности
router.post('/specialties/add', checkAuth, upload.single('specialty_image'), (req, res) => {
  const {
    code, name, duration, qualification, description, advantages, plan_url
  } = req.body;
  
  // Получаем путь к загруженному изображению
  const image_url = req.file ? `/uploads/specialties/${path.basename(req.file.path)}` : null;
  
  const query = `
    INSERT INTO specialties 
    (code, name, duration, qualification, description, advantages, image_url, plan_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.run(query, [
    code, name, duration, qualification, description, advantages, image_url, plan_url
  ], function(err) {
    if (err) {
      return res.render('admin/specialty_form', { 
        title: 'Добавление специальности',
        specialty: req.body,
        action: '/admin/specialties/add',
        error: 'Ошибка при добавлении специальности: ' + err.message
      });
    }
    
    res.redirect('/admin/specialties');
  });
});

// Форма редактирования специальности
router.get('/specialties/edit/:id', checkAuth, (req, res) => {
  const id = req.params.id;
  
  db.get(`SELECT * FROM specialties WHERE id = ?`, [id], (err, specialty) => {
    if (err || !specialty) {
      return res.redirect('/admin/specialties');
    }
    
    res.render('admin/specialty_form', { 
      title: 'Редактирование специальности',
      specialty: specialty,
      action: `/admin/specialties/edit/${id}`,
      error: null
    });
  });
});

// Редактирование специальности
router.post('/specialties/edit/:id', checkAuth, upload.single('specialty_image'), (req, res) => {
  const id = req.params.id;
  const {
    code, name, duration, qualification, description, advantages, plan_url
  } = req.body;
  
  // Получаем путь к загруженному изображению
  let image_url = req.file ? `/uploads/specialties/${path.basename(req.file.path)}` : null;
  
  // Если изображение не было загружено, сохраняем текущее
  if (!image_url) {
    db.get(`SELECT image_url FROM specialties WHERE id = ?`, [id], (err, row) => {
      if (!err && row) {
        image_url = row.image_url;
      }
      
      updateSpecialty();
    });
  } else {
    updateSpecialty();
  }
  
  function updateSpecialty() {
    const query = `
      UPDATE specialties 
      SET code = ?, name = ?, duration = ?, qualification = ?, 
          description = ?, advantages = ?, image_url = ?, plan_url = ?
      WHERE id = ?
    `;
    
    db.run(query, [
      code, name, duration, qualification, description, advantages, image_url, plan_url, id
    ], function(err) {
      if (err) {
        return res.render('admin/specialty_form', { 
          title: 'Редактирование специальности',
          specialty: { ...req.body, id },
          action: `/admin/specialties/edit/${id}`,
          error: 'Ошибка при обновлении специальности: ' + err.message
        });
      }
      
      res.redirect('/admin/specialties');
    });
  }
});

// Удаление специальности
router.post('/specialties/delete/:id', checkAuth, (req, res) => {
  const id = req.params.id;
  
  db.run(`DELETE FROM specialties WHERE id = ?`, [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Ошибка при удалении специальности' });
    }
    
    res.redirect('/admin/specialties');
  });
});

// ==================== УПРАВЛЕНИЕ ДОКУМЕНТАМИ ====================

// Список документов
router.get('/documents', checkAuth, (req, res) => {
  db.all(`SELECT * FROM documents ORDER BY category, name`, [], (err, documents) => {
    if (err) {
      return res.render('admin/documents', { 
        title: 'Управление документами',
        documents: [],
        error: 'Ошибка при получении списка документов'
      });
    }
    
    res.render('admin/documents', { 
      title: 'Управление документами',
      documents: documents,
      error: null
    });
  });
});

// Форма добавления документа
router.get('/documents/add', checkAuth, (req, res) => {
  res.render('admin/document_form', { 
    title: 'Добавление документа',
    document: null,
    action: '/admin/documents/add',
    error: null
  });
});

// Добавление документа
router.post('/documents/add', checkAuth, upload.single('document_file'), (req, res) => {
  const { name, category } = req.body;
  
  // Получаем путь к загруженному файлу
  const file_url = req.file ? `/uploads/documents/${path.basename(req.file.path)}` : null;
  
  const query = `
    INSERT INTO documents 
    (name, file_url, category)
    VALUES (?, ?, ?)
  `;
  
  db.run(query, [name, file_url, category], function(err) {
    if (err) {
      return res.render('admin/document_form', { 
        title: 'Добавление документа',
        document: req.body,
        action: '/admin/documents/add',
        error: 'Ошибка при добавлении документа: ' + err.message
      });
    }
    
    res.redirect('/admin/documents');
  });
});

// Форма редактирования документа
router.get('/documents/edit/:id', checkAuth, (req, res) => {
  const id = req.params.id;
  
  db.get(`SELECT * FROM documents WHERE id = ?`, [id], (err, document) => {
    if (err || !document) {
      return res.redirect('/admin/documents');
    }
    
    res.render('admin/document_form', { 
      title: 'Редактирование документа',
      document: document,
      action: `/admin/documents/edit/${id}`,
      error: null
    });
  });
});

// Редактирование документа
router.post('/documents/edit/:id', checkAuth, upload.single('document_file'), (req, res) => {
  const id = req.params.id;
  const { name, category } = req.body;
  
  // Получаем путь к загруженному файлу
  let file_url = req.file ? `/uploads/documents/${path.basename(req.file.path)}` : null;
  
  // Если файл не был загружен, сохраняем текущий
  if (!file_url) {
    db.get(`SELECT file_url FROM documents WHERE id = ?`, [id], (err, row) => {
      if (!err && row) {
        file_url = row.file_url;
      }
      
      updateDocument();
    });
  } else {
    updateDocument();
  }
  
  function updateDocument() {
    const query = `
      UPDATE documents 
      SET name = ?, file_url = ?, category = ?
      WHERE id = ?
    `;
    
    db.run(query, [name, file_url, category, id], function(err) {
      if (err) {
        return res.render('admin/document_form', { 
          title: 'Редактирование документа',
          document: { ...req.body, id },
          action: `/admin/documents/edit/${id}`,
          error: 'Ошибка при обновлении документа: ' + err.message
        });
      }
      
      res.redirect('/admin/documents');
    });
  }
});

// Удаление документа
router.post('/documents/delete/:id', checkAuth, (req, res) => {
  const id = req.params.id;
  
  db.run(`DELETE FROM documents WHERE id = ?`, [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Ошибка при удалении документа' });
    }
    
    res.redirect('/admin/documents');
  });
});

// ==================== УПРАВЛЕНИЕ АБИТУРИЕНТАМИ ====================

// Список абитуриентов
router.get('/applicants', checkAuth, (req, res) => {
  const sql = `
    SELECT a.*, s.code, s.name AS specialty_name, 
           (SELECT budget_limit FROM budget_limits WHERE specialty_id = a.specialty_id) AS budget_limit
    FROM applicants a
    JOIN specialties s ON a.specialty_id = s.id
    ORDER BY a.specialty_id, a.points DESC
  `;
  
  db.all(sql, [], (err, applicants) => {
    if (err) {
      return res.render('admin/applicants', { 
        title: 'Управление абитуриентами',
        applicants: [],
        specialties: [],
        error: 'Ошибка при получении списка абитуриентов'
      });
    }
    
    // Получаем список специальностей для фильтрации
    db.all(`SELECT * FROM specialties ORDER BY code`, [], (err, specialties) => {
      if (err) {
        return res.render('admin/applicants', { 
          title: 'Управление абитуриентами',
          applicants: applicants,
          specialties: [],
          error: 'Ошибка при получении списка специальностей'
        });
      }
      
      res.render('admin/applicants', { 
        title: 'Управление абитуриентами',
        applicants: applicants,
        specialties: specialties,
        error: null
      });
    });
  });
});

// Форма загрузки Excel-файла с абитуриентами
router.get('/applicants/upload', checkAuth, (req, res) => {
  db.all(`SELECT * FROM specialties ORDER BY code`, [], (err, specialties) => {
    if (err) {
      return res.render('admin/applicants_upload', { 
        title: 'Загрузка списка абитуриентов',
        specialties: [],
        error: 'Ошибка при получении списка специальностей'
      });
    }
    
    res.render('admin/applicants_upload', { 
      title: 'Загрузка списка абитуриентов',
      specialties: specialties,
      error: null,
      success: null
    });
  });
});

// Загрузка Excel-файла с абитуриентами
router.post('/applicants/upload', checkAuth, upload.single('applicants_file'), (req, res) => {
  const { specialty_id } = req.body;
  
  if (!req.file) {
    return res.render('admin/applicants_upload', { 
      title: 'Загрузка списка абитуриентов',
      error: 'Файл не загружен',
      success: null
    });
  }
  
  try {
    // Чтение Excel-файла
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    
    if (data.length === 0) {
      return res.render('admin/applicants_upload', { 
        title: 'Загрузка списка абитуриентов',
        error: 'Файл не содержит данных',
        success: null
      });
    }
    
    // Проверка наличия необходимых столбцов
    const requiredColumns = ['ФИО', 'Средний балл'];
    const missingColumns = requiredColumns.filter(col => !Object.keys(data[0]).includes(col));
    
    if (missingColumns.length > 0) {
      return res.render('admin/applicants_upload', { 
        title: 'Загрузка списка абитуриентов',
        error: `В файле отсутствуют обязательные столбцы: ${missingColumns.join(', ')}`,
        success: null
      });
    }
    
    // Удаляем существующих абитуриентов для выбранной специальности
    db.run(`DELETE FROM applicants WHERE specialty_id = ?`, [specialty_id], function(err) {
      if (err) {
        return res.render('admin/applicants_upload', { 
          title: 'Загрузка списка абитуриентов',
          error: 'Ошибка при очистке старых данных: ' + err.message,
          success: null
        });
      }
      
      // Добавляем новых абитуриентов
      const stmt = db.prepare(`
        INSERT INTO applicants (full_name, specialty_id, points, status)
        VALUES (?, ?, ?, ?)
      `);
      
      data.forEach(row => {
        const fullName = row['ФИО'] || '';
        const points = parseFloat(row['Средний балл']) || 0;
        const status = row['Статус'] || 'Ожидание';
        
        stmt.run(fullName, specialty_id, points, status);
      });
      
      stmt.finalize();
      
      // Обновляем статусы абитуриентов в зависимости от рейтинга
      updateApplicantStatuses(specialty_id);
      
      res.render('admin/applicants_upload', { 
        title: 'Загрузка списка абитуриентов',
        error: null,
        success: `Загружено ${data.length} абитуриентов`
      });
    });
  } catch (error) {
    return res.render('admin/applicants_upload', { 
      title: 'Загрузка списка абитуриентов',
      error: 'Ошибка при обработке файла: ' + error.message,
      success: null
    });
  }
});

// Форма редактирования лимитов бюджетных мест
router.get('/budget-limits', checkAuth, (req, res) => {
  const sql = `
    SELECT b.specialty_id, b.budget_limit, s.code, s.name
    FROM budget_limits b
    JOIN specialties s ON b.specialty_id = s.id
    ORDER BY s.code
  `;
  
  db.all(sql, [], (err, limits) => {
    if (err) {
      return res.render('admin/budget_limits', { 
        title: 'Лимиты бюджетных мест',
        limits: [],
        error: 'Ошибка при получении лимитов бюджетных мест'
      });
    }
    
    res.render('admin/budget_limits', { 
      title: 'Лимиты бюджетных мест',
      limits: limits,
      error: null,
      success: null
    });
  });
});

// Обновление лимитов бюджетных мест
router.post('/budget-limits/update', checkAuth, (req, res) => {
  const limits = req.body;
  
  // Обновляем лимиты для каждой специальности
  const updates = Object.keys(limits).filter(key => key.startsWith('limit_')).map(key => {
    const specialty_id = key.replace('limit_', '');
    const budget_limit = parseInt(limits[key]) || 0;
    
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO budget_limits (specialty_id, budget_limit) VALUES (?, ?)`,
        [specialty_id, budget_limit],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });
  
  Promise.all(updates)
    .then(() => {
      // Обновляем статусы абитуриентов для всех специальностей
      db.all(`SELECT id FROM specialties`, [], (err, rows) => {
        if (err) {
          return res.render('admin/budget_limits', { 
            title: 'Лимиты бюджетных мест',
            error: 'Ошибка при обновлении статусов абитуриентов',
            success: null
          });
        }
        
        const updatePromises = rows.map(row => updateApplicantStatuses(row.id));
        
        Promise.all(updatePromises)
          .then(() => {
            return res.redirect('/admin/budget-limits?success=1');
          })
          .catch(error => {
            return res.render('admin/budget_limits', { 
              title: 'Лимиты бюджетных мест',
              error: 'Ошибка при обновлении статусов абитуриентов: ' + error.message,
              success: null
            });
          });
      });
    })
    .catch(error => {
      return res.render('admin/budget_limits', { 
        title: 'Лимиты бюджетных мест',
        error: 'Ошибка при обновлении лимитов: ' + error.message,
        success: null
      });
    });
});

// Функция обновления статусов абитуриентов в зависимости от рейтинга
function updateApplicantStatuses(specialty_id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT budget_limit FROM budget_limits WHERE specialty_id = ?`,
      [specialty_id],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        const budget_limit = row ? row.budget_limit : 0;
        
        // Получаем список абитуриентов, отсортированный по баллам
        db.all(
          `SELECT id, points, status FROM applicants 
           WHERE specialty_id = ? AND status != 'СВО'
           ORDER BY points DESC`,
          [specialty_id],
          (err, applicants) => {
            if (err) {
              reject(err);
              return;
            }
            
            // Обновляем статусы
            const updates = applicants.map((applicant, index) => {
              const status = index < budget_limit ? 'Бюджет' : 'Внебюджет';
              
              return new Promise((resolve, reject) => {
                db.run(
                  `UPDATE applicants SET status = ? WHERE id = ?`,
                  [status, applicant.id],
                  function(err) {
                    if (err) reject(err);
                    else resolve();
                  }
                );
              });
            });
            
            Promise.all(updates)
              .then(resolve)
              .catch(reject);
          }
        );
      }
    );
  });
}

// ==================== УПРАВЛЕНИЕ ГАЛЕРЕЕЙ ====================

// Список изображений галереи
router.get('/gallery', checkAuth, (req, res) => {
  db.all(`SELECT * FROM gallery ORDER BY id`, [], (err, items) => {
    if (err) {
      return res.render('admin/gallery', { 
        title: 'Управление галереей',
        items: [],
        error: 'Ошибка при получении списка изображений'
      });
    }
    
    res.render('admin/gallery', { 
      title: 'Управление галереей',
      items: items,
      error: null
    });
  });
});

// Форма добавления изображения в галерею
router.get('/gallery/add', checkAuth, (req, res) => {
  res.render('admin/gallery_form', { 
    title: 'Добавление изображения',
    item: null,
    action: '/admin/gallery/add',
    error: null
  });
});

// Добавление изображения в галерею
router.post('/gallery/add', checkAuth, upload.single('gallery_image'), (req, res) => {
  const { title, type } = req.body;
  
  // Получаем путь к загруженному файлу
  const image_url = req.file ? `/uploads/gallery/${path.basename(req.file.path)}` : null;
  
  if (!image_url) {
    return res.render('admin/gallery_form', { 
      title: 'Добавление изображения',
      item: req.body,
      action: '/admin/gallery/add',
      error: 'Файл не загружен'
    });
  }
  
  const query = `
    INSERT INTO gallery 
    (title, image_url, type)
    VALUES (?, ?, ?)
  `;
  
  db.run(query, [title, image_url, type || 'image'], function(err) {
    if (err) {
      return res.render('admin/gallery_form', { 
        title: 'Добавление изображения',
        item: req.body,
        action: '/admin/gallery/add',
        error: 'Ошибка при добавлении изображения: ' + err.message
      });
    }
    
    res.redirect('/admin/gallery');
  });
});

// Форма редактирования изображения в галерее
router.get('/gallery/edit/:id', checkAuth, (req, res) => {
  const id = req.params.id;
  
  db.get(`SELECT * FROM gallery WHERE id = ?`, [id], (err, item) => {
    if (err || !item) {
      return res.redirect('/admin/gallery');
    }
    
    res.render('admin/gallery_form', { 
      title: 'Редактирование изображения',
      item: item,
      action: `/admin/gallery/edit/${id}`,
      error: null
    });
  });
});

// Редактирование изображения в галерее
router.post('/gallery/edit/:id', checkAuth, upload.single('gallery_image'), (req, res) => {
  const id = req.params.id;
  const { title, type } = req.body;
  
  // Получаем путь к загруженному файлу
  let image_url = req.file ? `/uploads/gallery/${path.basename(req.file.path)}` : null;
  
  // Если файл не был загружен, сохраняем текущий
  if (!image_url) {
    db.get(`SELECT image_url FROM gallery WHERE id = ?`, [id], (err, row) => {
      if (!err && row) {
        image_url = row.image_url;
      }
      
      updateGalleryItem();
    });
  } else {
    updateGalleryItem();
  }
  
  function updateGalleryItem() {
    const query = `
      UPDATE gallery 
      SET title = ?, image_url = ?, type = ?
      WHERE id = ?
    `;
    
    db.run(query, [title, image_url, type || 'image', id], function(err) {
      if (err) {
        return res.render('admin/gallery_form', { 
          title: 'Редактирование изображения',
          item: { ...req.body, id },
          action: `/admin/gallery/edit/${id}`,
          error: 'Ошибка при обновлении изображения: ' + err.message
        });
      }
      
      res.redirect('/admin/gallery');
    });
  }
});

// Удаление изображения из галереи
router.post('/gallery/delete/:id', checkAuth, (req, res) => {
  const id = req.params.id;
  
  db.run(`DELETE FROM gallery WHERE id = ?`, [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Ошибка при удалении изображения' });
    }
    
    res.redirect('/admin/gallery');
  });
});

// ==================== НАСТРОЙКИ БОТА ====================

// Форма редактирования настроек бота
router.get('/settings', checkAuth, (req, res) => {
  db.all(`SELECT * FROM settings WHERE key != 'admin_password'`, [], (err, settings) => {
    if (err) {
      return res.render('admin/settings', { 
        title: 'Настройки бота',
        settings: [],
        error: 'Ошибка при получении настроек'
      });
    }
    
    // Преобразуем список настроек в объект для удобства
    const settingsObj = {};
    settings.forEach(item => {
      settingsObj[item.key] = item.value;
    });
    
    res.render('admin/settings', { 
      title: 'Настройки бота',
      settings: settingsObj,
      error: null,
      success: null
    });
  });
});

// Обновление настроек бота
router.get('/settings', checkAuth, (req, res) => {
  try {
    db.all(`SELECT * FROM settings WHERE key != 'admin_password'`, [], (err, settings) => {
      if (err) {
        console.error('Ошибка при получении настроек:', err);
        return res.render('admin/settings', { 
          title: 'Настройки бота',
          settings: {},
          error: 'Ошибка при получении настроек'
        });
      }
      
      // Преобразуем список настроек в объект для удобства
      const settingsObj = {};
      settings.forEach(item => {
        settingsObj[item.key] = item.value;
      });
      
      // Установим значения по умолчанию для отсутствующих настроек
      const defaultSettings = {
        'admission_schedule': 'ПН - ПТ с 09:00 до 17:00\nСБ - с 09:00 до 13:00',
        'admission_address': 'ул. С. Перовской, 16. 2 этаж, ауд. 22',
        'admission_phone': '(471) 254-09-32',
        'admission_email': 'zavuch@kts46.ru',
        'admission_responsible': 'Авдеева Мария Валерьевна, заместитель директора по УР',
        'welcome_message': '👋 Добро пожаловать в чат-бот Абитуриента ОБПОУ "КИТ"!',
        'admin_username': 'admin'
      };
      
      // Добавляем отсутствующие настройки
      Object.keys(defaultSettings).forEach(key => {
        if (!settingsObj[key]) {
          settingsObj[key] = defaultSettings[key];
        }
      });
      
      const successMessage = req.query && req.query.success 
        ? req.query.success === 'password' 
          ? 'Пароль администратора успешно изменен.' 
          : 'Настройки успешно обновлены.' 
        : null;
      
      return res.render('admin/settings', { 
        title: 'Настройки бота',
        settings: settingsObj,
        error: null,
        success: successMessage
      });
    });
  } catch (error) {
    console.error('Необработанная ошибка:', error);
    return res.render('admin/settings', { 
      title: 'Настройки бота',
      settings: {},
      error: 'Произошла внутренняя ошибка сервера'
    });
  }
});

// Изменение пароля администратора
router.post('/settings/change-password', checkAuth, (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  
  if (new_password !== confirm_password) {
    return res.render('admin/settings', { 
      title: 'Настройки бота',
      error: 'Новый пароль и подтверждение не совпадают',
      success: null
    });
  }
  
  // Проверяем текущий пароль
  db.get(`SELECT value FROM settings WHERE key = 'admin_password'`, [], (err, row) => {
    if (err) {
      return res.render('admin/settings', { 
        title: 'Настройки бота',
        error: 'Ошибка при проверке пароля: ' + err.message,
        success: null
      });
    }
    
    const adminPassword = row ? row.value : 'kitadmin';
    
    if (current_password !== adminPassword) {
      return res.render('admin/settings', { 
        title: 'Настройки бота',
        error: 'Текущий пароль указан неверно',
        success: null
      });
    }
    
    // Обновляем пароль
    db.run(
      `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
      ['admin_password', new_password],
      function(err) {
        if (err) {
          return res.render('admin/settings', { 
            title: 'Настройки бота',
            error: 'Ошибка при обновлении пароля: ' + err.message,
            success: null
          });
        }
        
        return res.redirect('/admin/settings?success=password');
      }
    );
  });
});

module.exports = router;