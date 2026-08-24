import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventsGateway } from '../events/events.gateway';

describe('OrdersService', () => {
  let ordersService: OrdersService;
  let prismaServiceMock: any;
  let redisServiceMock: any;
  let eventsGatewayMock: any;
  
  beforeEach(async () => {
    prismaServiceMock = {
      cartItem: {
        findMany: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      orderItem: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };
    redisServiceMock = {
      delX: jest.fn(),
      deletePattern: jest.fn(),
    };
    eventsGatewayMock = {
      server: {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prismaServiceMock },
        { provide: RedisService, useValue: redisServiceMock },
        { provide: EventsGateway, useValue: eventsGatewayMock },
      ],
    }).compile();

    ordersService = module.get<OrdersService>(OrdersService);
  }
  );

  it('should be ok', () => {
    expect(ordersService).toBeDefined();
  })
});
