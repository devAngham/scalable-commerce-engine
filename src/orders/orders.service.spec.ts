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

  it('should throw NotFoundException if cart is empty',  async() => {

    // Mock the findFirst method to return null, simulating no existing order
    prismaServiceMock.order.findFirst.mockResolvedValueOnce(null);

    // Mock the transaction function to call the provided function with the mock PrismaService
    prismaServiceMock.$transaction.mockImplementation(async (fn: any) => {
      return fn(prismaServiceMock);
    });

    prismaServiceMock.cartItem.findMany.mockResolvedValue([]); // empty cart

    // Call the checkout method and expect it to throw a NotFoundException
    await expect(ordersService.checkout('user-id')).rejects.toThrow('Cart is empty');
  });

  it('should throw BadRequestException if user has an existing pending order', async () => {
    // Mock the findFirst method to return an existing order
    prismaServiceMock.order.findFirst.mockResolvedValue({
      id: 'existing-order-id',
      userId: 'user-id',
      status: 'PENDING',
    });

    // Call the checkout method and expect it to throw a BadRequestException
    await expect(ordersService.checkout('user-id')).rejects.toThrow('You already have a pending order');
  });
});
