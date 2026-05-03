package com.example

fun main() {
    val message = "Hello, Kotlin!"
    println(message)
}

data class Greeting(val name: String) {
    fun greet(): String = "Hello, $name!"
}
