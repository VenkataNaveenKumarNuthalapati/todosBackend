const express = require("express");
const app = express();

const sqlite = require("sqlite");
const { open } = sqlite;

const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const path = require("path");
const { request } = require("http");
const dbPath = path.join(__dirname, "./todos.db");

app.use(express.json());

let db = null;

const initializeDbServer = async () => {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        });

        app.listen(3000, () => {
            console.log("Server running at http://localhost:3000/");
        });
    } catch (error) {
        console.log(error);
        process.exit(1);
    }
};

initializeDbServer();

const userAuthorization = async (request, response, next) => {
    const { authorization } = request.headers;
    if (!authorization || !authorization.startsWith("Bearer ")) {
        return response.status(400).send("Invalid Access Token");
    }

    const jwtToken = authorization.split(" ")[1];

    try {
        const payload = await jwt.verify(jwtToken, "todo_key");

        request.user = payload;
        next();
    } catch (error) {
        return response.status(401).send("Invalid Access Token"); // Use 401 for unauthorized
    }
};

// API - 1 - /todos/register
app.post("/todos/register", async (request, response) => {
    const { name, username, password, image } = request.body;
    try {
        const user = await db.get(
            `select * from users where username = '${username}'`
        );
        if (!user) {
            if (password.length > 8) {
                response
                    .status(400)
                    .send("Password Length should be grater then 8 Characters");
            } else if (password.length > 15) {
                response
                    .status(400)
                    .send("Password Length should be less then 15 Characters");
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            let insertQuery = `insert into users 
                                  (username, password, name, image)
                            values('${username}','${hashedPassword}','${name}','${image}')`;
            await db.run(insertQuery);
            response.status(200).send("User Registered Successfully");
        } else {
            response.status(400).send("User Already Exists please Login");
        }
    } catch (error) {
        response.status(500).send(error);
    }
});

// API - 2 - /todos/login
app.post("/todos/login", async (request, response) => {
    const { username, password } = request.body;
    console.log(username, password);
    try {
        const user = await db.get(
            `select * from users where username = '${username}'`
        );
        if (!user) {
            return response
                .status(400)
                .send("User Not Found, Enter Correct username / Register");
        }

        const passMatch = await bcrypt.compare(password, user.password);
        if (passMatch) {
            // generate json token
            const token = await jwt.sign({ userId: user.user_id }, "todo_key", {
                expiresIn: "30d",
            });
            response.status(200).send({ token });
        } else {
            response.status(400).send("Incorrect password or username");
        }
    } catch (error) {
        response.status(500).send(error);
    }
});

// API - 3 - /todos/ to get al todos
app.get("/todos/", userAuthorization, async (request, response) => {
    const { userId } = request.user;
    console.log(userId);
    const todos = await db.all(
        `select * from todos where user_id = ${userId};`
    );
    response.status(200).send(todos);
});

// API - 4 - /todos/todo
app.post("/todos/todo", userAuthorization, async (request, response) => {
    const { todo_text } = request.body;
    const { userId } = request.user;

    const insertQuery = `insert into todos (todo_text,user_id)
                         values('${todo_text}',${userId})`;

    try {
        await db.run(insertQuery);
        response.status(200).send("Todo Added Successfully");
    } catch (error) {
        response.status(500).send(error);
    }
});

// API - 5 -/todos/update
app.put(
    "/todos/update/:todoId",
    userAuthorization,
    async (request, response) => {
        const { todoId } = request.params; // Extract the todo ID from the URL
        const { todo_text, is_checked } = request.body; // Get new text and checked status from request body
        const { userId } = request.user;

        try {
            const result = await db.run(
                `UPDATE todos 
             SET todo_text = ?, is_checked = ? 
             WHERE todo_id = ? AND user_id = ?`,
                [todo_text, is_checked, todoId, userId]
            );

            if (result.changes === 0) {
                return response
                    .status(404)
                    .send("Todo not found or not authorized to update.");
            }

            response.status(200).send("Todo Updated Successfully");
        } catch (error) {
            console.error("Update todo error:", error);
            response.status(500).send("Internal Server Error");
        }
    }
);

// API - 6 -/todos/delete
app.delete(
    "/todos/delete/:todoId",
    userAuthorization,
    async (request, response) => {
        const { todoId } = request.params; // Extract the todo ID from the URL
        const { userId } = request.user;

        try {
            const result = await db.run(
                `DELETE FROM todos 
             WHERE todo_id = ? AND user_id = ?`,
                [todoId, userId]
            );

            if (result.changes === 0) {
                return response
                    .status(404)
                    .send("Todo not found or not authorized to delete.");
            }

            response.status(200).send("Todo Deleted Successfully");
        } catch (error) {
            console.error("Delete todo error:", error);
            response.status(500).send("Internal Server Error");
        }
    }
);
