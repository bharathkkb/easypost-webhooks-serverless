-- mysql GCP cloud database
CREATE TABLE `task_storage` (
   `id` int(11) NOT NULL AUTO_INCREMENT,
   `queue_name` varchar(32) NOT NULL,
   `task_id` varchar(32) NOT NULL,
   `storage_contents` mediumtext NOT NULL,
   `task_created` tinyint(1) DEFAULT '0',
   `processed` tinyint(1) DEFAULT '0',
   `modified` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
   `created` datetime DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`),
   KEY `idx_queue_task` (`queue_name`,`task_id`)
 ) ENGINE=InnoDB COMMENT='task storage (google tasks have a 100KB limit, queues use this for larger payloads)'