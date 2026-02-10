export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelWeight: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40
};

const envLevel = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel;
const defaultLevel: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
const currentLevel: LogLevel = levelWeight[envLevel] ? envLevel : defaultLevel;

const sensitiveKeys = ['password', 'token', 'cookie', 'authorization', 'passcode', 'stoken'];

const isObject = (value: unknown): value is Record<string, any> => {
    return typeof value === 'object' && value !== null;
};

const truncate = (value: string, maxLength = 200) => {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}...`;
};

const redactString = (value: string) => {
    const masked = value.replace(/(password|token|cookie|authorization|passcode|stoken)=([^&\s]+)/gi, '$1=***');
    return truncate(masked);
};

const redactObject = (value: unknown, depth = 0): unknown => {
    if (depth > 6) return '[Truncated]';
    if (typeof value === 'string') return redactString(value);
    if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(item => redactObject(item, depth + 1));
    if (!isObject(value)) return String(value);

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
        if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
            result[key] = '***';
            continue;
        }
        if (val instanceof Error) {
            const errorData: Record<string, unknown> = { message: val.message };
            if (process.env.NODE_ENV !== 'production' && val.stack) {
                errorData.stack = val.stack;
            }
            result[key] = errorData;
            continue;
        }
        result[key] = redactObject(val, depth + 1);
    }
    return result;
};

const formatDetails = (details?: Record<string, unknown>) => {
    if (!details || Object.keys(details).length === 0) return '';
    const redacted = redactObject(details);
    try {
        return ` ${JSON.stringify(redacted)}`;
    } catch {
        return ' [Unserializable details]';
    }
};

const shouldLog = (level: LogLevel) => levelWeight[level] >= levelWeight[currentLevel];

const log = (level: LogLevel, message: string, details?: Record<string, unknown>) => {
    if (!shouldLog(level)) return;
    const timestamp = new Date().toISOString();
    let requestId: string | undefined;
    let safeDetails = details;
    if (details && typeof details.requestId === 'string') {
        requestId = details.requestId;
        safeDetails = { ...details };
        delete safeDetails.requestId;
    }
    const prefix = requestId ? `[${timestamp}] [${level}] [${requestId}]` : `[${timestamp}] [${level}]`;
    const output = `${prefix} ${message}${formatDetails(safeDetails)}`;
    if (level === 'error') {
        console.error(output);
    } else if (level === 'warn') {
        console.warn(output);
    } else {
        console.log(output);
    }
};

export const logger = {
    debug: (message: string, details?: Record<string, unknown>) => log('debug', message, details),
    info: (message: string, details?: Record<string, unknown>) => log('info', message, details),
    warn: (message: string, details?: Record<string, unknown>) => log('warn', message, details),
    error: (message: string, details?: Record<string, unknown>) => log('error', message, details)
};
