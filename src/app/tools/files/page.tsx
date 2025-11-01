// src/app/tools/files/page.tsx

"use client";

import { useState } from "react";
import { listFolders } from "@/lib/folders";
import { listFiles } from "@/lib/files";
import { listSharesByFile } from "@/lib/shares";
import { RoleGate } from "@/components/RoleGate";
import { FileTable } from "@/components/files/FileTable";
import { NewFolderForm } from "@/components/files/NewFolderForm";
import { UploadButton } from "@/components/files/UploadButton";
import { Breadcrumb } from "@/components/files/Breadcrumb";

export default async function FilesPage() {
  const userId = "currentUserId"; // hier ggf. dynamisch setzen

  const folders = await listFolders(userId, null);
  const files = await listFiles(userId, null);
  const moveTargets = await listFolders(userId, null);

  const sharesByFile = await listSharesByFile(userId, files);
  const siteBaseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

  const content = (
    <section className="grid gap-6">
      {/* Header + Breadcrumb + New Folder */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <Breadcrumb />
          <div className="flex gap-2">
            <NewFolderForm parentId={null} />
            <UploadButton folderId={null} />
          </div>
        </div>
      </div>

      {/* File Table */}
      <FileTable
        folders={folders}
        files={files}
        moveTargets={moveTargets}
        sharesByFile={sharesByFile}
        siteBaseUrl={siteBaseUrl}
      />
    </section>
  );

  return (
    <RoleGate routeKey="tools/files">
      {content}
    </RoleGate>
  );
}