import NextAuth from 'next-auth';
import type { NextRequest } from 'next/server';
import { getAuthOptions } from '../../../lib/auth';

const handler = async (
	request: NextRequest,
	context: { params: Promise<{ nextauth: string[] }> }
) => {
	const params = await context.params;
	const options = await getAuthOptions();
	return NextAuth(options)(request, { params });
};

export { handler as GET, handler as POST };
