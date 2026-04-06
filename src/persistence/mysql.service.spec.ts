import { ConfigService } from '@nestjs/config';
import { MysqlService } from './mysql.service';

describe('MysqlService', () => {
  it('ignores repeated pool shutdown while a close is already in progress', async () => {
    const deferred: { resolve: () => void } = {
      resolve: () => undefined,
    };
    const end = jest.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          deferred.resolve = resolve;
        }),
    );

    const service = new MysqlService({} as ConfigService);
    (
      service as unknown as {
        pool: {
          end: () => Promise<void>;
        };
      }
    ).pool = { end };

    const firstDestroy = service.onModuleDestroy();
    const secondDestroy = service.onModuleDestroy();

    expect(end).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await Promise.all([firstDestroy, secondDestroy]);
  });

  it('swallows mysql closed state errors during shutdown', async () => {
    const end = jest
      .fn()
      .mockRejectedValue(new Error("Can't add new command when connection is in closed state"));

    const service = new MysqlService({} as ConfigService);
    (
      service as unknown as {
        pool: {
          end: () => Promise<void>;
        };
      }
    ).pool = { end };

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(end).toHaveBeenCalledTimes(1);
  });
});
