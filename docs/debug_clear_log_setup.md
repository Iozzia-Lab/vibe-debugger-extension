# Debug Clear Log Script Setup

## Overview

The `debug_clear_log.py` script allows the Chrome extension to clear log files in your project by making HTTP requests to the script deployed in your project root.

## Deployment

1. Copy `debug_clear_log.py` to your project root directory
2. Configure your web server to execute Python scripts

## Web Server Configuration

### Apache (.htaccess)

Add to your `.htaccess` file in the project root:

```apache
AddHandler cgi-script .py
Options +ExecCGI
```

Or for mod_wsgi:

```apache
WSGIScriptAlias /debug_clear_log.py /path/to/project/debug_clear_log.py
```

### Nginx

Configure FastCGI or uWSGI to handle Python scripts:

```nginx
location ~ \.py$ {
    fastcgi_pass unix:/var/run/fcgiwrap.socket;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
}
```

### Python http.server (Development)

For local development, you can use Python's built-in server with CGI support:

```bash
python -m http.server --cgi 8100
```

Then access via: `http://localhost:8100/debug_clear_log.py?log=...`

## Security Considerations

1. **Restrict Access**: Configure your web server to only allow access from localhost/internal network
2. **Path Validation**: The script accepts any file path - ensure your project folder structure is secure
3. **File Permissions**: Ensure the web server user has write permissions to log files
4. **CORS**: The script returns `Access-Control-Allow-Origin: *` - restrict this in production if needed

## Usage

The extension will automatically call this script when:
- A project is active
- The current tab URL matches the project domain
- The user clicks "Clear"

Request format:
```
GET http://{projectDomain}/debug_clear_log.py?log={fullPath}
```

Example:
```
GET http://project1.localhost/debug_clear_log.py?log=d:\dev\project1\v\1\error_log
```

## Response Format

Success:
```json
{
    "success": true,
    "message": "Log file cleared successfully: d:\\dev\\project1\\v\\1\\error_log"
}
```

Error:
```json
{
    "success": false,
    "message": "Log file not found: d:\\dev\\project1\\v\\1\\error_log"
}
```

## Testing

Test the script manually:

```bash
# Windows
curl "http://project1.localhost/debug_clear_log.py?log=d:\dev\project1\v\1\error_log"

# Linux/Mac
curl "http://project1.localhost/debug_clear_log.py?log=/path/to/project/v/1/error_log"
```

## Troubleshooting

1. **Script not accessible**: Check web server configuration and file permissions
2. **Permission denied**: Ensure web server user has write access to log file directory
3. **CORS errors**: Verify script returns proper CORS headers
4. **File not found**: Check that log file path is correct and file exists
