/*
  Warnings:

  - A unique constraint covering the columns `[user_id,service_project_id]` on the table `user_service_project` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `user_service_project_unique` ON `user_service_project`(`user_id`, `service_project_id`);
