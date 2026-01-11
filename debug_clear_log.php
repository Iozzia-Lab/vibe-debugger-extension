<?php
/**
 * Debug Log File Clearer (PHP Version)
 * This script clears (truncates) log files when called via HTTP GET request.
 * Deploy this script in your project root directory.
 * 
 * Usage:
 *     http://{projectDomain}/debug_clear_log.php?log={fullPath}
 * 
 * Example:
 *     http://api.ser.vi.localhost/debug_clear_log.php?log=D:\dev\project1\v\1\error_log
 */

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
// PHP's file functions handle both / and \ on Windows, but normalize for consistency
$normalizedPath = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $logPath);

// Check if file exists
if (!file_exists($normalizedPath)) {
    echo json_encode([
        'success' => false,
        'message' => "Log file not found: $normalizedPath"
    ]);
    exit;
}

// Check if it's a file (not a directory)
if (!is_file($normalizedPath)) {
    echo json_encode([
        'success' => false,
        'message' => "Path is not a file: $normalizedPath"
    ]);
    exit;
}

// Clear file (truncate to empty)
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
