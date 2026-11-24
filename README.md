# КТ 6 Платформа блога

Backend для пользователей, публикаций и тегов. В проекте есть черновики и опубликованные посты, поиск по заголовку, чат Socket.IO и три роли. Это итоговая версия КТ 3–5.

## Запуск через Docker

Нужны Docker и Docker Compose. В папке `kt06` создай `.env` по примеру `.env.example`. Впиши пароль PostgreSQL и два разных секрета JWT. Для каждого значения можно запустить `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Для пароля базы используй буквы и цифры, тогда его не нужно кодировать внутри URL.

```sh
docker compose up --build
```

В старой версии Compose команда называется `docker-compose up --build`. Контейнер app применяет миграции после готовности PostgreSQL и Redis. API доступен на http://localhost:3000, Swagger на http://localhost:3000/api/docs/. Если порт 3000 занят, измени `PORT` в `.env`. Контейнеры db и redis доступны внутри сети Compose. Именованные Docker volumes сохраняют БД и Redis между перезапусками.

Чтобы назначить первого администратора, зарегистрируй аккаунт, затем выполни `docker compose exec app npm run admin:promote -- student@example.com` с его почтой. Пароль и токены не нужно прикладывать к работе.

## Маршруты REST

| Метод | Маршрут | Доступ и действие |
| --- | --- | --- |
| GET | /health | Проверка подключения к PostgreSQL и Redis |
| GET | /api/docs | Swagger UI |
| GET | /api/docs.json | OpenAPI JSON |
| POST | /auth/register | Регистрация по `name`, `email`, `password` |
| POST | /auth/login | Вход. Access-токен в JSON, refresh в HttpOnly cookie |
| POST | /auth/refresh | Обновление пары токенов по refresh cookie |
| POST | /auth/logout | Завершение сессии и очистка cookie |
| GET | /auth/me | Профиль по access-токену |
| GET | /api/users | Список. MODERATOR или ADMIN |
| POST | /api/users | Создать пользователя. ADMIN |
| GET | /api/users/:id | Пользователь с его постами. Свой профиль, MODERATOR или ADMIN |
| PATCH | /api/users/:id | Изменить почту или имя. Сам пользователь или ADMIN |
| DELETE | /api/users/:id | Удалить пользователя вместе с его постами и сессиями. ADMIN |
| PATCH | /admin/users/:id/role | Назначить роль. ADMIN |
| GET | /api/posts | Список с фильтрами. Любая роль |
| POST | /api/posts | Создать свой пост. Любая роль |
| GET | /api/posts/:id | Пост, автор и теги. Любая роль |
| PATCH | /api/posts/:id | Редактировать. Владелец, MODERATOR или ADMIN |
| DELETE | /api/posts/:id | Удалить. Владелец, MODERATOR или ADMIN |

В Swagger сначала выполни логин, скопируй `data.accessToken` и нажми **Authorize**. Токен отправляется в заголовке `Authorization: Bearer <accessToken>`. Запрос `GET /api/posts?search=node&published=true&authorId=1&page=1&limit=5` проверяет фильтры и пагинацию. Запросы с телом принимают JSON. Одиночная запись находится в `data`, список содержит `data` и `meta`, ошибки возвращаются в `error`. Успешные DELETE возвращают 204 без тела.

## Тесты

`docker compose exec app npm test` запускает Jest и Supertest в контейнере. Для запуска без Docker установи зависимости через `npm ci`, укажи `DATABASE_URL` и два JWT-секрета, выполни `npm run db:generate`, `npm run db:migrate` и `npm test`. Можно задать отдельный `TEST_DATABASE_URL`. Для каждого интеграционного набора создаётся отдельная схема PostgreSQL, которую тесты удаляют после завершения.

## Чат

Socket.IO работает на порту API. Клиент передаёт `auth: { token: accessToken }` при подключении. Событие `users:online` даёт список пользователей новому клиенту. События `user:online` и `user:offline` сообщают остальным о подключении и отключении. `message:send` с полем `text` отправляет сообщение всем через `message:new`. Для комнаты используй `room:join` с полем `room`, затем `room:message` с `room` и `text`. `room:leave` позволяет выйти. История сообщений не хранится.

## Деплой в Render

Помести содержимое `kt06` в корень отдельного репозитория. В Render выбери **New Blueprint** и укажи этот репозиторий. В `render.yaml` прописаны приложение, PostgreSQL, Redis и передача переменных окружения. Render генерирует секреты. Миграции выполнит контейнер при запуске. После деплоя проверь `/health` и `/api/docs/` на выданном HTTPS-адресе. В бесплатном плане Render PostgreSQL хранится 30 дней, поэтому лучше привязать запуск к дате защиты.

## Устная защита

- Express принимает запрос и передаёт его через middleware к маршруту. Prisma связывает JavaScript-код и PostgreSQL.
- Один пользователь может написать много постов. Несколько постов могут использовать один тег. `connectOrCreate` позволяет не дублировать имена тегов.
- Access-токен живёт 15 минут. Refresh-токен хранится в HttpOnly cookie, а в БД лежит его хэш. При обновлении сервер заменяет хэш и выдаёт новую пару токенов.
- Роль берётся из базы при запросе. Поэтому смена роли действует и для пользователя, который уже вошёл. Владелец поста определяется по `authorId`.
- Redis хранит счётчик запросов к логину, PostgreSQL хранит записи приложения. Docker Compose запускает и связывает сервисы.
