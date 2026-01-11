# XAMPP Python CGI Setup Guide (Windows)

This guide explains how to set up the `debug_clear_log.py` script to run as a CGI script in XAMPP on Windows 11.

## Prerequisites

1. **XAMPP installed** (with Apache running)
2. **Python 3 installed** on your system
3. **Path to Python executable** (usually `C:\Python3x\python.exe` or `C:\Users\YourName\AppData\Local\Programs\Python\Python3x\python.exe`)

## Step 1: Find Your Python Installation

1. Open Command Prompt (cmd)
2. Run: `where python`
3. Note the full path (e.g., `C:\Python312\python.exe`)

Alternatively, check:
- `C:\Python3x\python.exe`
- `C:\Users\YourName\AppData\Local\Programs\Python\Python3x\python.exe`
- Or check in XAMPP Control Panel → Config → PHP → php.ini (look for Python path references)

## Step 2: Modify the Python Script for Windows

The script needs a Windows-compatible shebang line. Create a new file or modify `debug_clear_log.py`:

**Option A: Use Python Launcher (Recommended)**
```python
#!C:/Python312/python.exe
# Or use: #!python3
```

**Option B: Use Full Path**
```python
#!C:/Python312/python.exe
```

Replace `C:/Python312/python.exe` with your actual Python path (use forward slashes `/` not backslashes `\`).

## Step 3: Configure Apache in XAMPP

### 3.1 Enable CGI Module

1. Open XAMPP Control Panel
2. Click **Config** next to Apache → **httpd.conf**
3. Find this line (around line 180-200):
   ```apache
   #LoadModule cgid_module modules/mod_cgid.so
   ```
4. Remove the `#` to uncomment it:
   ```apache
   LoadModule cgid_module modules/mod_cgid.so
   ```

### 3.2 Enable CGI Script Execution

In the same `httpd.conf` file, find the section for your document root or virtual host. Look for something like:

```apache
<Directory "C:/xampp/htdocs">
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
</Directory>
```

Change it to:

```apache
<Directory "C:/xampp/htdocs">
    Options Indexes FollowSymLinks ExecCGI
    AllowOverride All
    Require all granted
</Directory>
```

**Important:** Add `ExecCGI` to the `Options` line. This allows CGI script execution.

### 3.3 Add Handler for Python Scripts

Still in `httpd.conf`, add this line (you can add it near other `AddHandler` directives, around line 400-500):

```apache
AddHandler cgi-script .py .pl .cgi
```

This tells Apache to treat `.py` files as CGI scripts.

### 3.4 Save and Restart Apache

1. Save `httpd.conf`
2. In XAMPP Control Panel, click **Stop** then **Start** for Apache

## Step 4: Deploy the Script

1. Copy `debug_clear_log.py` to your project's root directory (the directory served by Apache)
   - Example: `C:\xampp\htdocs\your-project\debug_clear_log.py`
   - Or in your virtual host directory if you have one configured

2. **Important:** Make sure the script has the correct shebang line pointing to your Python executable (from Step 2)

## Step 5: Test the Script

### Test 1: Direct Browser Test

Open your browser and navigate to:
```
http://api.ser.vi.localhost/debug_clear_log.py?log=C:\test\test.log
```

**Expected Result:**
- If the file doesn't exist: JSON response with `"success": false`
- If the file exists: JSON response with `"success": true` and the file is cleared

**If you see the Python code instead of JSON:**
- Apache is not executing the script (check Steps 3.1-3.3)
- The shebang line is wrong (check Step 2)
- Python path is incorrect

### Test 2: Check Apache Error Log

If it doesn't work, check the Apache error log:
1. XAMPP Control Panel → Apache → **Logs** → **Error Log**
2. Look for Python-related errors

Common errors:
- `(2)No such file or directory: exec of 'C:/xampp/htdocs/.../debug_clear_log.py' failed`
  - **Fix:** Check the shebang line path in the script
- `Premature end of script headers`
  - **Fix:** Check that the script outputs headers correctly (Content-Type, etc.)

## Step 6: Virtual Host Configuration (Optional)

If you're using virtual hosts (like `api.ser.vi.localhost`), make sure your virtual host configuration also allows CGI:

In `C:\xampp\apache\conf\extra\httpd-vhosts.conf`:

```apache
<VirtualHost *:80>
    ServerName api.ser.vi.localhost
    DocumentRoot "C:/xampp/htdocs/your-project"
    
    <Directory "C:/xampp/htdocs/your-project">
        Options Indexes FollowSymLinks ExecCGI
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

Don't forget to add `ExecCGI` to the Options line!

## Troubleshooting

### Script Returns Python Code Instead of JSON

1. **Check Apache Configuration:**
   - Is `mod_cgid` loaded? (Step 3.1)
   - Is `ExecCGI` in Options? (Step 3.2)
   - Is `.py` in AddHandler? (Step 3.3)

2. **Check Script Shebang:**
   - Does it point to a valid Python executable?
   - Use forward slashes `/` not backslashes `\`
   - Try: `#!python3` (if Python is in PATH)

3. **Check File Permissions:**
   - Make sure Apache can read the script file
   - Make sure Python can write to the log file location

### Permission Denied Errors

- Make sure the log file path is writable
- Check Windows file permissions
- Consider running Apache with elevated permissions (not recommended for security)

### Python Not Found

- Verify Python is installed: `python --version` in cmd
- Update the shebang line with the correct path
- Or add Python to your system PATH

## Alternative: Use PHP Instead

If Python CGI setup is too complex, you can create a PHP equivalent:

**Create `debug_clear_log.php`:**
```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$logPath = $_GET['log'] ?? '';

if (empty($logPath)) {
    echo json_encode([
        'success' => false,
        'message' => "Missing 'log' parameter"
    ]);
    exit;
}

// Normalize path (handle Windows backslashes)
$normalizedPath = str_replace('\\', '/', $logPath);

// Check if file exists
if (!file_exists($normalizedPath)) {
    echo json_encode([
        'success' => false,
        'message' => "Log file not found: $normalizedPath"
    ]);
    exit;
}

// Clear file
if (file_put_contents($normalizedPath, '') !== false) {
    echo json_encode([
        'success' => true,
        'message' => "Log file cleared successfully: $normalizedPath"
    ]);
} else {
    echo json_encode([
        'success' => false,
        'message' => "Permission denied: unable to clear log file $normalizedPath"
    ]);
}
?>
```

Then update the extension to use `.php` instead of `.py` in the script URL.

## Summary Checklist

- [ ] Python 3 installed and path known
- [ ] Script shebang line updated with correct Python path
- [ ] Apache `mod_cgid` module enabled
- [ ] `ExecCGI` added to Directory Options
- [ ] `AddHandler cgi-script .py` added to httpd.conf
- [ ] Script deployed to project directory
- [ ] Apache restarted
- [ ] Test URL returns JSON (not Python code)
