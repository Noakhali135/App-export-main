const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;
const WORKSPACE = process.cwd();

app.use(express.json());

// Helper function to recursively read file system into frontend structure
function getFileTree(dirPath, currentId = { value: 1 }) {
    const items = fs.readdirSync(dirPath);
    const result = [];

    items.forEach(item => {
        // Skip hidden and system generated build directories
        if (['.git', 'node_modules', '.gradle', 'build', '.github', 'server.js', 'package.json', 'package-lock.json'].includes(item)) {
            return;
        }

        const fullPath = path.join(dirPath, item);
        const relativePath = path.relative(WORKSPACE, fullPath);
        const stats = fs.statSync(fullPath);
        const id = (currentId.value++).toString();

        if (stats.isDirectory()) {
            result.push({
                id: id,
                name: item,
                isFolder: true,
                isOpen: false,
                path: relativePath,
                children: getFileTree(fullPath, currentId)
            });
        } else {
            let content = '';
            try {
                content = fs.readFileSync(fullPath, 'utf-8');
            } catch (e) {
                content = 'Binary file or unreadable asset.';
            }
            result.push({
                id: id,
                name: item,
                isFolder: false,
                content: content,
                path: relativePath
            });
        }
    });

    return result;
}

// Serve the main cloud IDE interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Fetch active repository workspace files
app.get('/api/files', (req, res) => {
    try {
        const tree = getFileTree(WORKSPACE);
        res.json({ success: true, files: tree });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Write live data changes to workspace disk
app.post('/api/save', (req, res) => {
    const { filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ success: false, error: 'Missing target file path.' });

    const securePath = path.join(WORKSPACE, filePath);
    
    // Safety guard to prevent writes breaking outside workspace boundary
    if (!securePath.startsWith(WORKSPACE)) {
        return res.status(403).json({ success: false, error: 'Directory traversal security violation.' });
    }

    try {
        fs.mkdirSync(path.dirname(securePath), { recursive: true });
        fs.writeFileSync(securePath, content, 'utf-8');
        res.json({ success: true, message: 'File synchronized to workspace storage successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Trigger localized system deletion
app.post('/api/delete', (req, res) => {
    const { filePath } = req.body;
    const securePath = path.join(WORKSPACE, filePath);
    if (!securePath.startsWith(WORKSPACE)) return res.status(403).json({ success: false });

    try {
        if (fs.statSync(securePath).isDirectory()) {
            fs.rmSync(securePath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(securePath);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stream real-time compilation execution data strings
app.get('/api/build', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write(`data: ${JSON.stringify({ log: '🚀 Initiating Cloud Platform 35 compilation sequence...' })}\n\n`);

    // Ensure compilation scripts maintain execution credentials
    exec('chmod +x gradlew', (err) => {
        if (err) {
            res.write(`data: ${JSON.stringify({ log: `❌ Execution flag assignment fault: ${err.message}` })}\n\n`);
            res.end();
            return;
        }

        const buildProcess = exec('./gradlew assembleDebug');

        buildProcess.stdout.on('data', (data) => {
            res.write(`data: ${JSON.stringify({ log: data.toString().trim() })}\n\n`);
        });

        buildProcess.stderr.on('data', (data) => {
            res.write(`data: ${JSON.stringify({ log: `⚠️ ${data.toString().trim()}` })}\n\n`);
        });

        buildProcess.on('close', (code) => {
            if (code === 0) {
                res.write(`data: ${JSON.stringify({ log: '✨ SUCCESS: Compilation phase finalized without errors.', status: 'complete' })}\n\n`);
            } else {
                res.write(`data: ${JSON.stringify({ log: `❌ FAILURE: Gradle engine closed with exit matrix status ${code}`, status: 'failed' })}\n\n`);
            }
            res.end();
        });
    });
});

// Commit local workspace code changes back to GitHub repository
app.post('/api/sync-github', (req, res) => {
    const commitMessage = req.body.message || "CloudForge IDE Workspace Sync";
    
    const commands = [
        'git config --local user.email "actions@github.com"',
        'git config --local user.name "CloudForge Engine"',
        'git add .',
        `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
        'git push origin HEAD'
    ].join(' && ');

    exec(commands, (error, stdout, stderr) => {
        if (error) {
            if (stdout.includes('nothing to commit') || stderr.includes('nothing to commit')) {
                return res.json({ success: true, message: 'Workspace already matches GitHub reference repository.' });
            }
            return res.status(500).json({ success: false, error: stderr || error.message });
        }
        res.json({ success: true, message: 'Workspace commits synchronized to GitHub repository origin.' });
    });
});

app.listen(PORT, () => {
    console.log(`CloudForge Dynamic Engine active on internal communication channel port ${PORT}`);
});
