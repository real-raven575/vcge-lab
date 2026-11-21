plugins {
    id("com.android.application") version "8.7.3"
    kotlin("android") version "2.0.21"
}

android {
    namespace = "com.herdofhelpers.helperboard"
    compileSdk = 35

    defaultConfig {
        // ".proto" keeps the store id free until the real app is ready.
        applicationId = "com.herdofhelpers.helperboard.proto"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "0.1.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}-proto"
    }

    buildTypes {
        debug { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint {
        // The prototype builds even with lint warnings; lint still runs in CI and its report is uploaded.
        abortOnError = false
    }
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    // No other libraries: only the Android framework and our own core rules. Nothing that could reach the internet.
    implementation(project(":core"))
}
