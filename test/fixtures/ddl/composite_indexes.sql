-- Fixture for testing composite index parsing
CREATE TABLE `audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `action` varchar(100) NOT NULL,
  `resource_type` varchar(100) NOT NULL,
  `resource_id` bigint unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `audit_logs_user_action_index` (`user_id`,`action`),
  KEY `audit_logs_resource_index` (`resource_type`,`resource_id`),
  KEY `audit_logs_created_at_index` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE UNIQUE INDEX idx_audit_logs_unique_key ON audit_logs(user_id, action, resource_id);
