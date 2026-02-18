import Cap from "@cap.js/server";
import { SQL } from "bun";

const db = SQL("sqlite://.data/ratelimit.sqlite");

(async () => {
  await db`
  CREATE TABLE IF NOT EXISTS cap_challenges (
    token TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires INTEGER NOT NULL
  )
`;

  await db`CREATE INDEX IF NOT EXISTS idx_cap_challenges_expires ON cap_challenges(expires)`;

  await db`
  CREATE TABLE IF NOT EXISTS cap_tokens (
    key TEXT PRIMARY KEY,
    expires INTEGER NOT NULL
  )
`;

  await db`CREATE INDEX IF NOT EXISTS idx_cap_tokens_expires ON cap_tokens(expires)`;
})();

const cap = new Cap({
  noFSState: true,
  storage: {
    challenges: {
      store: async (token, challengeData) => {
        const data = JSON.stringify(challengeData);
        await db`
          INSERT INTO cap_challenges (token, data, expires)
          VALUES (${token}, ${data}, ${challengeData.expires})
          ON CONFLICT (token)
          DO UPDATE SET
            data = ${data},
            expires = ${challengeData.expires}
        `;
      },

      read: async (token) => {
        const [row] = await db`
          SELECT data
          FROM cap_challenges
          WHERE token = ${token}
            AND expires > ${Date.now()}
          LIMIT 1
        `;

        return row ? JSON.parse(row.data) : null;
      },

      delete: async (token) => {
        await db`
          DELETE FROM cap_challenges
          WHERE token = ${token}
        `;
      },

      deleteExpired: async () => {
        await db`
          DELETE FROM cap_challenges
          WHERE expires <= ${Date.now()}
        `;
      },
    },

    tokens: {
      store: async (tokenKey, expires) => {
        await db`
          INSERT INTO cap_tokens (key, expires)
          VALUES (${tokenKey}, ${expires})
          ON CONFLICT (key)
          DO UPDATE SET
            expires = ${expires}
        `;
      },

      get: async (tokenKey) => {
        const [row] = await db`
          SELECT expires
          FROM cap_tokens
          WHERE key = ${tokenKey}
            AND expires > ${Date.now()}
          LIMIT 1
        `;

        return row ? Number(row.expires) : null;
      },

      delete: async (tokenKey) => {
        await db`
          DELETE FROM cap_tokens
          WHERE key = ${tokenKey}
        `;
      },

      deleteExpired: async () => {
        await db`
          DELETE FROM cap_tokens
          WHERE expires <= ${Date.now()}
        `;
      },
    },
  },
});

export default cap;
