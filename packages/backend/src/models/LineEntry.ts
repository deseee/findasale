import { prisma } from '../lib/prisma';

export interface LineEntry {
  id: string;
  saleId: string;
  userId: string;
  position: number;
  status: 'WAITING' | 'CALLED' | 'SERVED' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
}

export const createLineEntries = async (saleId: string) => {
  try {
    // Get all subscribers for this sale
    const subscribers = await prisma.saleSubscriber.findMany({
      where: {
        saleId,
        phone: { not: null },
        userId: { not: null },
      },
    });

    // Create line entries for each subscriber
    const lineEntries = [];
    for (let i = 0; i < subscribers.length; i++) {
      const entry = await prisma.lineEntry.create({
        data: {
          saleId,
          userId: subscribers[i].userId!, // userId filtered to non-null above
          position: i + 1,
          status: 'WAITING'
        }
      });
      lineEntries.push(entry);
    }

    return lineEntries;
  } catch (error) {
    console.error('Error creating line entries:', error);
    throw error;
  }
};

export const getNextInLine = async (saleId: string) => {
  try {
    const nextEntry = await prisma.lineEntry.findFirst({
      where: {
        saleId,
        status: 'WAITING'
      },
      orderBy: {
        position: 'asc'
      }
    });

    return nextEntry;
  } catch (error) {
    console.error('Error getting next in line:', error);
    throw error;
  }
};

export const updateLineEntryStatus = async (id: string, status: LineEntry['status']) => {
  try {
    const updatedEntry = await prisma.lineEntry.update({
      where: { id },
      data: { 
        status,
        updatedAt: new Date()
      }
    });

    return updatedEntry;
  } catch (error) {
    console.error('Error updating line entry status:', error);
    throw error;
  }
};

export const getLineEntriesForSale = async (saleId: string) => {
  try {
    const entries = await prisma.lineEntry.findMany({
      where: { saleId },
      include: {
        user: { select: { id: true, name: true, email: true } }
      },
      orderBy: { position: 'asc' }
    });

    return entries;
  } catch (error) {
    console.error('Error fetching line entries:', error);
    throw error;
  }
};
