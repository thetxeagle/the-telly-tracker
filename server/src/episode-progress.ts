import { z } from "zod"

export const bulkEpisodeLimit = 500

export const progressSchema = z.object({ watched: z.boolean() })

export const bulkProgressSchema = progressSchema.extend({
  episodeIds: z.array(z.string().min(1)).min(1).max(bulkEpisodeLimit),
})
