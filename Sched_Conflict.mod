using CP;

// ------------------------------------------------------------
// IMPORTACIÓN DE DATOS DESDE CSV (GENÉRICO)
// ------------------------------------------------------------

// 1) Parámetros del modelo
tuple ParamRow { 
  string Parameter; 
  int Value; 
}
{ParamRow} parameters = ...;

// Extraer número de recursos dinámicamente
int NumberResources = sum(r in parameters: r.Parameter=="NumberResources") r.Value;
range ResourcesIDs = 0..NumberResources-1;

// 2) Capacidades de recursos (genérico)
tuple CapacityTuple {
  int IDresource;
  int capacity;
}
{CapacityTuple} TupleCapacity = ...;

// 3) Definición genérica de tareas
tuple Task {
  key int id;
  int pt;         // processing time (duración)
  int smin;       // tiempo mínimo de inicio
  int emax;       // tiempo máximo de fin
}
{Task} Tasks = ...;

// 4) Demandas de recursos por tarea (estructura flexible)
tuple ResourceDemand {
  int taskId;
  int resourceId;
  int demand;
}
{ResourceDemand} TaskResourceDemands = ...;

// 5) Precedencias entre tareas
tuple Precedence {
  int beforeId;
  int afterId;
}
{Precedence} Precedences = ...;

// ------------------------------------------------------------
// ARRAYS GENÉRICOS PARA DEMANDAS
// ------------------------------------------------------------

// Array genérico para demandas de recursos por tarea
int ResourceDemandArr[t in Tasks][r in ResourcesIDs] = 
  sum(d in TaskResourceDemands: d.taskId == t.id && d.resourceId == r) d.demand;

// Array para capacidades indexado por recurso
int ResourceCapacityArr[r in ResourcesIDs] = 
  sum(c in TupleCapacity: c.IDresource == r) c.capacity;

// ------------------------------------------------------------
// VARIABLES DE DECISIÓN
// ------------------------------------------------------------

dvar interval itvs[t in Tasks];

// ------------------------------------------------------------
// FUNCIÓN DE USO ACUMULADO DE RECURSOS (GENÉRICA)
// ------------------------------------------------------------

cumulFunction rsrcUsage[r in ResourcesIDs] =
  sum(t in Tasks)
    pulse(itvs[t], maxl(0, ResourceDemandArr[t][r]));

// ------------------------------------------------------------
// CONFIGURACIÓN DEL SOLVER
// ------------------------------------------------------------

execute {
  cp.param.FailLimit = 10000;
  cp.param.CumulFunctionInferenceLevel = "Extended";
}

// ------------------------------------------------------------
// FUNCIÓN OBJETIVO
// ------------------------------------------------------------

minimize max(t in Tasks) endOf(itvs[t]);

// ------------------------------------------------------------
// RESTRICCIONES
// ------------------------------------------------------------

subject to {
  // Restricciones de duración
  forall(t in Tasks)
    sizeOf(itvs[t]) == t.pt;
  
  // Restricciones de ventanas de tiempo
  forall(t in Tasks) {
    startOf(itvs[t]) >= t.smin;
    endOf(itvs[t]) <= t.emax;
  }

  // Restricciones de capacidad de recursos (genérica)
  forall(r in ResourcesIDs) {
    rsrcUsage[r] <= ResourceCapacityArr[r];
  }

  // Restricciones de precedencia
  forall(p in Precedences) {
    endBeforeStart(itvs[<p.beforeId>], itvs[<p.afterId>]);
  }
}

// ------------------------------------------------------------
// DEFINICIÓN DE TUPLAS DE SALIDA GENÉRICAS
// ------------------------------------------------------------

tuple SolutionSummary {
  int Makespan;
  int TotalTasks;
  int TotalResources;
  string Status;
}

tuple TaskScheduleDetail {
  int TaskID;
  int StartTime;
  int EndTime;
  int Duration;
}

tuple TaskResourceUsage {
  int TaskID;
  int ResourceID;
  int Demand;
}

tuple ResourceUsageDetail {
  int ResourceID;
  int Capacity;
  int MaxUsage;
  float UtilizationRate;
}

tuple ResourceUsageByTime {
  int ResourceID;
  int TimePoint;
  int Usage;
}

// Declaración de conjuntos de salida
{SolutionSummary} SolutionResults = {};
{TaskScheduleDetail} TaskScheduleOutput = {};
{TaskResourceUsage} TaskResourceUsageOutput = {};
{ResourceUsageDetail} ResourceUsageResults = {};
{ResourceUsageByTime} ResourceTimelineOutput = {};

// ------------------------------------------------------------
// POST-PROCESAMIENTO GENÉRICO
// ------------------------------------------------------------

execute POPULATE_OUTPUT_TUPLES {
    
    writeln("=== RESULTADOS DE PROGRAMACIÓN DE TAREAS GENÉRICA ===");
    writeln("Número de recursos: ", NumberResources);
    writeln("Número de tareas: ", Tasks.size);
    
    // 1) Calcular makespan
    var makespan = 0;
    for(var t in Tasks) {
      if(itvs[t].end > makespan) {
        makespan = itvs[t].end;
      }
    }
    
    writeln("Makespan = ", makespan);
    writeln();
    
    // 2) Resumen de la solución
    SolutionResults.add(
      makespan,                               // Makespan
      Tasks.size,                            // TotalTasks
      NumberResources,                       // TotalResources
      "OPTIMAL"                              // Status
    );

    // 3) Detalles de programación de cada tarea
    writeln("Programación de tareas:");
    for(var t in Tasks) {
      writeln("  Tarea ", t.id, ": inicia en ", itvs[t].start, 
              ", termina en ", itvs[t].end, " (duración: ", t.pt, ")");
      
      TaskScheduleOutput.add(
        t.id,                                 // TaskID
        itvs[t].start,                        // StartTime
        itvs[t].end,                          // EndTime
        t.pt                                  // Duration
      );
    }
    writeln();

    // 4) Uso de recursos por tarea (genérico)
    writeln("Demandas de recursos por tarea:");
    for(var t in Tasks) {
      writeln("  Tarea ", t.id, ":");
      for(var r in ResourcesIDs) {
        if(ResourceDemandArr[t][r] > 0) {
          writeln("    Recurso ", r, ": ", ResourceDemandArr[t][r]);
          
          TaskResourceUsageOutput.add(
            t.id,                             // TaskID
            r,                                // ResourceID
            ResourceDemandArr[t][r]           // Demand
          );
        }
      }
    }
    writeln();

    // 5) Análisis de uso de recursos
    writeln("Análisis de capacidad de recursos:");
    for(var r in ResourcesIDs) {
      var capacity = ResourceCapacityArr[r];
      var maxUsage = 0;
      
      // Calcular uso máximo simultáneo del recurso
      for(var time = 0; time <= makespan; time++) {
        var currentUsage = 0;
        for(var t in Tasks) {
          if(itvs[t].start <= time && time < itvs[t].end) {
            currentUsage += ResourceDemandArr[t][r];
          }
        }
        if(currentUsage > maxUsage) {
          maxUsage = currentUsage;
        }
        
        // Guardar uso por tiempo si es mayor a 0
        if(currentUsage > 0) {
          ResourceTimelineOutput.add(
            r,                                // ResourceID
            time,                            // TimePoint
            currentUsage                     // Usage
          );
        }
      }
      
      var utilizationRate = (capacity > 0 ? (maxUsage * 100.0) / capacity : 0);
      
      writeln("  Recurso ", r, ": capacidad = ", capacity, 
              ", uso máximo = ", maxUsage, 
              ", utilización = ", utilizationRate, "%");
      
      ResourceUsageResults.add(
        r,                                    // ResourceID
        capacity,                            // Capacity
        maxUsage,                            // MaxUsage
        utilizationRate                      // UtilizationRate
      );
    }
    writeln();
    
    // 6) Verificar factibilidad de recursos
    var infeasible = false;
    for(var r in ResourcesIDs) {
      var capacity = ResourceCapacityArr[r];
      for(var time = 0; time <= makespan; time++) {
        var currentUsage = 0;
        for(var t in Tasks) {
          if(itvs[t].start <= time && time < itvs[t].end) {
            currentUsage += ResourceDemandArr[t][r];
          }
        }
        if(currentUsage > capacity) {
          writeln("ADVERTENCIA: Recurso ", r, " excede capacidad en tiempo ", time);
          infeasible = true;
        }
      }
    }
    
    if(!infeasible) {
      writeln("✓ Todas las restricciones de recursos se satisfacen");
    }
    
    writeln("=== FIN DE RESULTADOS ===");
}