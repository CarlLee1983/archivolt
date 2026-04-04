-- Fixture with charset/collation options that regex must tolerate
CREATE TABLE `sessions` (
  `id` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 NOT NULL,
  `user_agent` text CHARACTER SET utf8mb4 DEFAULT NULL,
  `payload` longtext CHARACTER SET utf8mb4 NOT NULL,
  `last_activity` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;
