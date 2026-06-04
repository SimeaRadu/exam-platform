$server = "localhost\SQLEXPRESS"
$database = "BazaDeDateSiteTeste"
$output = Join-Path $PSScriptRoot "local-data-export.sql"

$tables = @(
  "users",
  "subjects",
  "exams",
  "exam_variants",
  "questions",
  "answers",
  "student_exam_assignments",
  "student_answers",
  "results"
)

$deleteOrder = @(
  "student_test_events",
  "student_answer_drafts",
  "student_sessions",
  "results",
  "student_answers",
  "student_exam_assignments",
  "answers",
  "questions",
  "exam_variants",
  "exams",
  "subjects",
  "users"
)

function Convert-ToSqlValue($value) {
  if ($null -eq $value -or $value -is [DBNull]) {
    return "NULL"
  }

  if ($value -is [bool]) {
    if ($value) { return "1" }
    return "0"
  }

  if ($value -is [byte] -or $value -is [int] -or $value -is [long] -or $value -is [decimal] -or $value -is [double] -or $value -is [single]) {
    return ([string]$value).Replace(",", ".")
  }

  if ($value -is [DateTime]) {
    return "CONVERT(DATETIME2, '$($value.ToString("yyyy-MM-ddTHH:mm:ss.fffffff"))', 126)"
  }

  $text = [string]$value
  $text = $text.Replace("'", "''")
  return "N'$text'"
}

$connectionString = "Server=$server;Database=$database;Integrated Security=True;TrustServerCertificate=True;"
$connection = New-Object System.Data.SqlClient.SqlConnection($connectionString)
$connection.Open()

try {
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("SET NOCOUNT ON;")
  $lines.Add("BEGIN TRY")
  $lines.Add("  BEGIN TRANSACTION;")
  $lines.Add("")
  $lines.Add("  -- Curata datele existente din Azure in ordinea corecta a dependentelor.")

  foreach ($table in $deleteOrder) {
    $lines.Add("  IF OBJECT_ID('$table', 'U') IS NOT NULL DELETE FROM [$table];")
  }

  $lines.Add("")

  foreach ($table in $tables) {
    $schemaCommand = $connection.CreateCommand()
    $schemaCommand.CommandText = @"
SELECT c.name, c.is_identity
FROM sys.columns c
WHERE c.object_id = OBJECT_ID(@table)
ORDER BY c.column_id;
"@
    $null = $schemaCommand.Parameters.Add("@table", [System.Data.SqlDbType]::NVarChar, 128)
    $schemaCommand.Parameters["@table"].Value = $table

    $reader = $schemaCommand.ExecuteReader()
    $columns = @()
    $hasIdentity = $false

    while ($reader.Read()) {
      $isIdentity = [bool]$reader["is_identity"]
      $columns += [PSCustomObject]@{
        Name = [string]$reader["name"]
        IsIdentity = $isIdentity
      }

      if ($isIdentity) {
        $hasIdentity = $true
      }
    }

    $reader.Close()

    if ($columns.Count -eq 0) {
      continue
    }

    $selectColumns = ($columns | ForEach-Object { "[$($_.Name)]" }) -join ", "
    $dataCommand = $connection.CreateCommand()
    $dataCommand.CommandText = "SELECT $selectColumns FROM [$table] ORDER BY [$($columns[0].Name)]"
    $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($dataCommand)
    $data = New-Object System.Data.DataTable
    [void]$adapter.Fill($data)

    if ($data.Rows.Count -eq 0) {
      continue
    }

    $lines.Add("  -- Date pentru tabelul $table")

    if ($hasIdentity) {
      $lines.Add("  SET IDENTITY_INSERT [$table] ON;")
    }

    $columnList = ($columns | ForEach-Object { "[$($_.Name)]" }) -join ", "

    foreach ($row in $data.Rows) {
      $values = ($columns | ForEach-Object { Convert-ToSqlValue $row[$_.Name] }) -join ", "
      $lines.Add("  INSERT INTO [$table] ($columnList) VALUES ($values);")
    }

    if ($hasIdentity) {
      $lines.Add("  SET IDENTITY_INSERT [$table] OFF;")
    }

    $lines.Add("")
  }

  $lines.Add("  COMMIT TRANSACTION;")
  $lines.Add("END TRY")
  $lines.Add("BEGIN CATCH")
  $lines.Add("  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;")
  $lines.Add("  THROW;")
  $lines.Add("END CATCH;")

  Set-Content -Path $output -Value $lines -Encoding UTF8
  Write-Host "Export creat: $output"
} finally {
  $connection.Close()
}
