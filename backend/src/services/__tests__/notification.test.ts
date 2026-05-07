import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrackerService } from '../tracker.service.js';

const mockGet = vi.fn();

vi.mock('../../db/index.js', () => ({
    getDb: () => ({
        get: mockGet,
    }),
    decryptSettingValue: (_key: string, value: string) => value,
}));

vi.mock('../../logger.js', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('node-cron', () => ({
    default: {
        schedule: vi.fn(() => ({ stop: vi.fn() })),
    },
}));

vi.mock('./cloud-storage.service.js', () => ({
    CloudStorageService: {
        getInstance: () => ({}),
    },
}));

vi.mock('./telegram.service.js', () => ({
    TelegramService: {
        getInstance: () => ({ notify: vi.fn(), notifyUser: vi.fn() }),
    },
}));

vi.mock('./discord.service.js', () => ({
    DiscordService: {
        getInstance: () => ({ notify: vi.fn(), notifyUser: vi.fn() }),
    },
}));

describe('Notification Targets Config', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (TrackerService as any).instance = undefined;
    });

    it('should return default targets when config not exists', async () => {
        mockGet.mockResolvedValue(undefined);

        const service = TrackerService.getInstance();
        const targets = await (service as any).getNotificationTargets();
        expect(targets).toEqual(['telegram_chat', 'discord_channel']);
    });

    it('should parse valid JSON config', async () => {
        mockGet.mockResolvedValue({ value: '["telegram_chat", "telegram_user"]' });

        const service = TrackerService.getInstance();
        const targets = await (service as any).getNotificationTargets();
        expect(targets).toEqual(['telegram_chat', 'telegram_user']);
    });

    it('should return default on invalid JSON', async () => {
        mockGet.mockResolvedValue({ value: 'invalid json' });

        const service = TrackerService.getInstance();
        const targets = await (service as any).getNotificationTargets();
        expect(targets).toEqual(['telegram_chat', 'discord_channel']);
    });
});
