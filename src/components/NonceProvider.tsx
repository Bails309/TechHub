'use client';

import React, { createContext, useContext } from 'react';

const NonceContext = createContext<string | undefined>(undefined);

export function NonceProvider({ nonce, children }: { nonce?: string; children: React.ReactNode }) {
    return (
        <NonceContext.Provider value={nonce}>
            {children}
        </NonceContext.Provider>
    );
}

export function useNonce() {
    return useContext(NonceContext);
}
