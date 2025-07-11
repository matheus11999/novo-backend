/system script add name="mikropix-cleanup" policy=read,write,policy,test,password comment=MIKROPIX source=":local logPrefix \"AutoRemover-v7\"
:local tempoAtual [/system clock get time]
:local dataAtual [/system clock get date]
:log info \"[\$logPrefix] Iniciando verificação. Data/Hora atual: \$dataAtual \$tempoAtual\"

:local totalUsers 0
:local totalBindings 0
:local removidosUsers 0
:local removidosBindings 0
:local ativosUsers 0
:local ativosBindings 0

:local meses {\"jan\"=1;\"feb\"=2;\"mar\"=3;\"apr\"=4;\"may\"=5;\"jun\"=6;\"jul\"=7;\"aug\"=8;\"sep\"=9;\"oct\"=10;\"nov\"=11;\"dec\"=12}

:local mesAtualNum
:local diaAtual
:local anoAtual
:if ([:pick \$dataAtual 4 5] = \"/\") do={
    :set mesAtualNum [:tonum [:pick \$dataAtual 5 7]]
    :set diaAtual [:tonum [:pick \$dataAtual 8 10]]
    :set anoAtual [:tonum [:pick \$dataAtual 0 4]]
} else={
    :if ([:pick \$dataAtual 4 5] = \"-\") do={
        :set mesAtualNum [:tonum [:pick \$dataAtual 5 7]]
        :set diaAtual [:tonum [:pick \$dataAtual 8 10]]
        :set anoAtual [:tonum [:pick \$dataAtual 0 4]]
    } else={
        :set mesAtualNum (\$meses->[:tolower [:pick \$dataAtual 4 7]])
        :set diaAtual [:tonum [:pick \$dataAtual 8 10]]
        :set anoAtual [:tonum [:pick \$dataAtual 0 4]]
    }
}
:local horaAtualNum [:tonum [:pick \$tempoAtual 0 2]]
:local minAtualNum [:tonum [:pick \$tempoAtual 3 5]]
:log debug \"[\$logPrefix] Data atual parsed: \$anoAtual-\$mesAtualNum-\$diaAtual \$horaAtualNum:\$minAtualNum\"

:do {
    :foreach i in=[/ip hotspot user find where comment~\"Expira:\"] do={
        :set totalUsers (\$totalUsers + 1)
        :local userName [/ip hotspot user get \$i name]
        :local userComment [/ip hotspot user get \$i comment]
        
        :local posInicio ([:find \$userComment \"Expira: \"] + 8)
        :if (\$posInicio > 7) do={
            :local dataExpCompleta [:pick \$userComment \$posInicio [:len \$userComment]]
            :if ([:len \$dataExpCompleta] >= 16) do={
                :local dataExp [:pick \$dataExpCompleta 0 10]
                :local horaExp [:pick \$dataExpCompleta 11 16]
                
                :local diaExp [:tonum [:pick \$dataExp 0 2]]
                :local mesExp [:tonum [:pick \$dataExp 3 5]]
                :local anoExp [:tonum [:pick \$dataExp 6 10]]
                :local horaExpNum [:tonum [:pick \$horaExp 0 2]]
                :local minExpNum [:tonum [:pick \$horaExp 3 5]]
                
                :log debug \"[\$logPrefix] User: \$userName | Exp: \$diaExp/\$mesExp/\$anoExp \$horaExpNum:\$minExpNum\"
                
                :if ([:typeof \$diaExp] = \"num\" && [:typeof \$mesExp] = \"num\" && [:typeof \$anoExp] = \"num\" && [:typeof \$horaExpNum] = \"num\" && [:typeof \$minExpNum] = \"num\") do={
                    :local expirado false
                    :if (\$anoExp < \$anoAtual) do={ :set expirado true }
                    :if (\$anoExp = \$anoAtual && \$mesExp < \$mesAtualNum) do={ :set expirado true }
                    :if (\$anoExp = \$anoAtual && \$mesExp = \$mesAtualNum && \$diaExp < \$diaAtual) do={ :set expirado true }
                    :if (\$anoExp = \$anoAtual && \$mesExp = \$mesAtualNum && \$diaExp = \$diaAtual && \$horaExpNum < \$horaAtualNum) do={ :set expirado true }
                    :if (\$anoExp = \$anoAtual && \$mesExp = \$mesAtualNum && \$diaExp = \$diaAtual && \$horaExpNum = \$horaAtualNum && \$minExpNum <= \$minAtualNum) do={ :set expirado true }
                    
                    :if (\$expirado) do={
                        :log warning \"[\$logPrefix] Hotspot User: '\$userName' expirou em \$dataExp \$horaExp. Removendo.\"
                        /ip hotspot user remove \$i
                        :set removidosUsers (\$removidosUsers + 1)
                    } else={
                        :log info \"[\$logPrefix] User: '\$userName' expira em \$dataExp \$horaExp\"
                        :set ativosUsers (\$ativosUsers + 1)
                    }
                } else={
                    :log error \"[\$logPrefix] Formato de data inválido para usuário: \$userName | Comment: \$userComment\"
                }
            } else={
                :log error \"[\$logPrefix] Comentário inválido para usuário: \$userName | Comment: \$userComment\"
            }
        }
    }

    :foreach i in=[/ip hotspot ip-binding find where comment~\"Expira:\"] do={
        :set totalBindings (\$totalBindings + 1)
        :local bindingMac [/ip hotspot ip-binding get \$i mac-address]
        :local bindingComment [/ip hotspot ip-binding get \$i comment]
        
        :if ([:len \$bindingMac] = 0) do={
            :log error \"[\$logPrefix] IP Binding com MAC vazio. Ignorando.\"
            :set totalBindings (\$totalBindings - 1)
            :next
        }
        
        :local posInicio ([:find \$bindingComment \"Expira: \"] + 8)
        :if (\$posInicio > 7) do={
            :local dataExpCompleta [:pick \$bindingComment \$posInicio [:len \$bindingComment]]
            :local dataExp \"\"
            :local horaExp \"\"
            
            :if ([:find \$dataExpCompleta \"-\"] != -1) do={
                :local ano [:pick \$dataExpCompleta 0 4]
                :local mes [:pick \$dataExpCompleta 5 7]
                :local dia [:pick \$dataExpCompleta 8 10]
                :local hora [:pick \$dataExpCompleta 11 16]
                :set dataExp \"\$dia/\$mes/\$ano\"
                :set horaExp \$hora
            } else={
                :if ([:len \$dataExpCompleta] >= 16) do={
                    :set dataExp [:pick \$dataExpCompleta 0 10]
                    :set horaExp [:pick \$dataExpCompleta 11 16]
                }
            }
            
            :if ([:len \$dataExp] = 10 && [:len \$horaExp] = 5) do={
                :local diaExp [:tonum [:pick \$dataExp 0 2]]
                :local mesExp [:tonum [:pick \$dataExp 3 5]]
                :local anoExp [:tonum [:pick \$dataExp 6 10]]
                :local horaExpNum [:tonum [:pick \$horaExp 0 2]]
                :local minExpNum [:tonum [:pick \$horaExp 3 5]]
                
                :log debug \"[\$logPrefix] IP Binding MAC: \$bindingMac | Exp: \$diaExp/\$mesExp/\$anoExp \$horaExpNum:\$minExpNum\"
                
                :if ([:typeof \$diaExp] = \"num\" && [:typeof \$mesExp] = \"num\" && [:typeof \$anoExp] = \"num\" && [:typeof \$horaExpNum] = \"num\" && [:typeof \$minExpNum] = \"num\") do={
                    :local expirado false
                    :if (\$anoExp < \$anoAtual) do={ :set expirado true }
                    :if (\$anoExp = \$anoAtual && \$mesExp < \$mesAtualNum) do={ :set expirado true }
                    :if (\$anoExp = \$anoAtual && \$mesExp = \$mesAtualNum && \$diaExp < \$diaAtual) do={ :set expirado true }
                    :if (\$anoExp = \$anoAtual && \$mesExp = \$mesAtualNum && \$diaExp = \$diaAtual && \$horaExpNum < \$horaAtualNum) do={ :set expirado true }
                    :if (\$anoExp = \$anoAtual && \$mesExp = \$mesAtualNum && \$diaExp = \$diaAtual && \$horaExpNum = \$horaAtualNum && \$minExpNum <= \$minAtualNum) do={ :set expirado true }
                    
                    :if (\$expirado) do={
                        :log warning \"[\$logPrefix] IP Binding MAC: '\$bindingMac' expirou em \$dataExp \$horaExp. Removendo.\"
                        /ip hotspot ip-binding remove \$i
                        :set removidosBindings (\$removidosBindings + 1)
                    } else={
                        :log info \"[\$logPrefix] IP Binding MAC: '\$bindingMac' expira em \$dataExp \$horaExp\"
                        :set ativosBindings (\$ativosBindings + 1)
                    }
                } else={
                    :log error \"[\$logPrefix] Formato de data inválido para MAC: \$bindingMac | Comment: \$bindingComment\"
                }
            } else={
                :log error \"[\$logPrefix] Comentário inválido para MAC: \$bindingMac | Comment: \$bindingComment\"
            }
        }
    }

    :log info \"[\$logPrefix] ========== RELATÓRIO FINAL ==========\"
    :log info \"[\$logPrefix] HOTSPOT USERS: Total=\$totalUsers | Ativos=\$ativosUsers | Removidos=\$removidosUsers\"
    :log info \"[\$logPrefix] IP BINDINGS: Total=\$totalBindings | Ativos=\$ativosBindings | Removidos=\$removidosBindings\"
    :log info \"[\$logPrefix] TOTAL REMOVIDOS: \$(\$removidosUsers + \$removidosBindings)\"
    :log info \"[\$logPrefix] Verificação concluída.\"
} on-error={
    :log error \"[\$logPrefix] Erro durante a execução do script.\"
    :log info \"[\$logPrefix] ========== RELATÓRIO FINAL ==========\"
    :log info \"[\$logPrefix] HOTSPOT USERS: Total=\$totalUsers | Ativos=\$ativosUsers | Removidos=\$removidosUsers\"
    :log info \"[\$logPrefix] IP BINDINGS: Total=\$totalBindings | Ativos=\$ativosBindings | Removidos=\$removidosBindings\"
    :log info \"[\$logPrefix] TOTAL REMOVIDOS: \$(\$removidosUsers + \$removidosBindings)\"
    :log info \"[\$logPrefix] Verificação concluída com erro.\"
}"

/system scheduler add name="mikropix-cleanup-task" interval=2m on-event="mikropix-cleanup" comment=MIKROPIX