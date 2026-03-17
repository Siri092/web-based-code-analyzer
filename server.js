console.log("=== THIS IS THE ACTIVE SERVER FILE ===");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();

/* ============================== */
/* MIDDLEWARE */
app.use(cors());
app.use(express.json());

/* HOME ROUTE */
app.get("/", (req, res) => {
    res.send("Code Analyzer API is running 🚀");
});

/* ANALYZE ROUTE */
app.post("/analyze", async (req, res) => {
    // your logic
});

/* ============================== */
function compileCode(code) {
    return new Promise((resolve) => {

        const fileName = "temp.cpp";
        fs.writeFileSync(fileName, code);

        const compiler = spawn(
            "C:\\mingw64\\bin\\g++.exe",
            ["-fsyntax-only", fileName],
            { shell: true }
        );

        let errorOutput = "";

        compiler.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        compiler.on("close", (exitCode) => {

            if (fs.existsSync(fileName)) {
                fs.unlinkSync(fileName);
            }

            resolve({
                success: exitCode === 0,
                errors: exitCode === 0 ? null : errorOutput
            });
        });
    });
}

/* ============================== */
app.post("/analyze", async (req, res) => {
    try {

        // ✅ FIXED (function scope)
        var confidenceReasons = [];
        var suggestions = [];

        let code = req.body.code;

        if (!code || !code.trim()) {
            return res.status(400).json({ error: "No code provided" });
        }

        code = code.replace(/^\d+\s*/gm, "");

        /* ========================== */
        const compileResult = await compileCode(code);

        if (!compileResult.success) {
            return res.json({
                syntaxValid: false,
                compileErrors: compileResult.errors,
                complexity: "-",
                spaceComplexity: "-",
                recurrence: "-",
                category: "-",
                confidence: 0,
                confidenceReasons: ["Compilation failed"],
                suggestions: [],
                graphData: []
            });
        }

        /* ========================== */
        const lines = code.split("\n");

        let loopDepth = 0;
        let maxLoopDepth = 0;
        let logLoopDetected = false;

        lines.forEach((line) => {
            const t = line.trim();

            if (/for\s*\(|while\s*\(/.test(t)) {
                loopDepth++;
                maxLoopDepth = Math.max(maxLoopDepth, loopDepth);

                if (
                    /(\*=|\/=)\s*2/.test(t) ||
                    />>\s*1/.test(t) ||
                    /\w+\s*=\s*\w+\s*\*\s*2/.test(t) ||
                    /\w+\s*=\s*\w+\s*<<\s*1/.test(t)
                ) {
                    logLoopDetected = true;
                }
            }

            if (t.includes("}")) {
                loopDepth = Math.max(0, loopDepth - 1);
            }
        });

        /* -------- RECURSION -------- */
        let recursionDetected = false;
        let recursionCalls = 0;

        const functionDefs = [...code.matchAll(/\b(int|void|double|float|long)\s+(\w+)\s*\([^)]*\)\s*{/g)];

        for (let def of functionDefs) {
            const name = def[2];
            const body = code.slice(def.index);

            const matches = [...body.matchAll(new RegExp("\\b" + name + "\\s*\\(", "g"))];

            if (matches.length > 1) {
                recursionDetected = true;
                recursionCalls = matches.length - 1;
                break;
            }
        }

        /* -------- PATTERNS -------- */

        let binarySearchDetected = false;
        if (
            /(while|for)\s*\(.*<=.*\)/.test(code) &&
            /(mid|m)\s*=\s*.*(\/\s*2|>>\s*1)/.test(code) &&
            (
                /(l|low)\s*=\s*(mid|m)\s*\+\s*1/.test(code) ||
                /(r|high)\s*=\s*(mid|m)\s*-\s*1/.test(code)
            )
        ) {
            binarySearchDetected = true;
            confidenceReasons.push("Search space halves each iteration");
        }

        let twoPointerDetected = false;
        if (
            /(l|left)\s*=/.test(code) &&
            /(r|right)\s*=/.test(code) &&
            /(l\+\+|r--|left\+\+|right--)/.test(code) &&
            maxLoopDepth === 1
        ) {
            twoPointerDetected = true;
            confidenceReasons.push("Two pointers move linearly");
        }

        let slidingWindowDetected = false;
        if (
            /while\s*\(.*\)/.test(code) &&
            /(sum|window)/.test(code) &&
            /(l\+\+|left\+\+)/.test(code)
        ) {
            slidingWindowDetected = true;
            confidenceReasons.push("Sliding window expands and shrinks");
        }

        let mergePattern = recursionDetected && recursionCalls >= 2 && /\bmerge\s*\(/.test(code);
        let sortDetected = /\bsort\s*\(/.test(code);

        /* -------- DECISION -------- */

        let complexity = "O(1)";
        let category = "Constant";
        let recurrence = "-";

        if (mergePattern) {
            complexity = "O(n log n)";
            category = "Merge Sort";
        }
        else if (binarySearchDetected) {
            complexity = "O(log n)";
            category = "Binary Search";
        }
        else if (slidingWindowDetected) {
            complexity = "O(n)";
            category = "Sliding Window";
        }
        else if (twoPointerDetected) {
            complexity = "O(n)";
            category = "Two Pointer";
        }
        else if (sortDetected) {
            complexity = "O(n log n)";
            category = "Library Sort";
        }
        else if (recursionDetected && recursionCalls >= 2) {
            complexity = "O(2^n)";
            category = "Exponential Recursion";
        }
        else if (recursionDetected) {
            complexity = "O(n)";
            category = "Linear Recursion";
        }
        else if (maxLoopDepth >= 3) {
            complexity = "O(n^3)";
            category = "Triple Nested Loop";
        }
        else if (maxLoopDepth === 2) {
            complexity = "O(n^2)";
            category = "Nested Loop";
        }
        else if (maxLoopDepth === 1 && logLoopDetected) {
            complexity = "O(log n)";
            category = "Logarithmic Loop";
        }
        else if (maxLoopDepth === 1) {
            complexity = "O(n)";
            category = "Linear Scan";
        }

        let spaceComplexity = recursionDetected ? "O(n)" : "O(1)";

        return res.json({
            syntaxValid: true,
            complexity,
            spaceComplexity,
            recurrence,
            category,
            confidence: 0.99,
            confidenceReasons,
            suggestions,
            graphData: []
        });

    } catch (error) {
        console.error("Server error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

/* ============================== */
const http = require("http");

const server = http.createServer(app);

server.listen(3000, () => {
    console.log("Backend running on http://localhost:3000");
});